/*
    Copyright (C) 2017 Red Hat, Inc.

    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at

            http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.
*/

import { Injectable } from '@angular/core';
import { Headers, Http, RequestOptions, Response, HttpModule } from '@angular/http';
import 'rxjs/add/operator/toPromise';
import { Observable } from 'rxjs/Rx';
import 'rxjs/add/observable/forkJoin';
import { Subject } from 'rxjs/Subject';

import { ConfigModel } from '../models/config.model';
import { Field, EnumValue } from '../models/field.model';
import { DocumentDefinition } from '../models/document.definition.model';
import { MappingDefinition } from '../models/mapping.definition.model';

import { ErrorHandlerService } from './error.handler.service';
import { DocumentManagementService } from '../services/document.management.service';
import { MappingManagementService } from '../services/mapping.management.service';
import { MappingSerializer } from '../services/mapping.serializer';
import { ValidationService } from '../services/validation.service';
import { FieldActionService } from '../services/field.action.service';

import { TransitionModel, FieldAction, FieldActionConfig } from '../models/transition.model';

@Injectable()
export class InitializationService {
    public cfg: ConfigModel = ConfigModel.getConfig();
    private mappingInitialized: boolean = false;
    private fieldActionsInitialized: boolean = false;

    private systemInitializedSource = new Subject<void>();
    systemInitialized$ = this.systemInitializedSource.asObservable();

    private initializationStatusChangedSource = new Subject<void>();
    initializationStatusChanged$ = this.initializationStatusChangedSource.asObservable();

    /* TEST DATA CONFIG */
    private static addMockActionConfig: boolean = false;
    private static addMockJSONMappings: boolean = false;

    constructor(private documentService: DocumentManagementService,
        private mappingService: MappingManagementService,
        private errorService: ErrorHandlerService,
        private validationService: ValidationService,
        private fieldActionService: FieldActionService) {
        console.log("Initialization Service being created.");
        this.cfg.documentService = documentService;
        this.cfg.mappingService = mappingService;
        this.cfg.errorService = errorService;
        this.cfg.initializationService = this;
        this.cfg.validationService = validationService;
        this.cfg.fieldActionService = fieldActionService;

        this.cfg.documentService.cfg = this.cfg;
        this.cfg.mappingService.cfg = this.cfg;
        this.cfg.validationService.cfg = this.cfg;
        this.cfg.fieldActionService.cfg = this.cfg;

        this.cfg.documentService.initialize();
        this.cfg.mappingService.initialize();
        this.cfg.validationService.initialize();
        this.cfg.fieldActionService.initialize();
    }

    public initialize(): void {
        console.log("Data Mapper UI is now initializing.");

        if (InitializationService.addMockJSONMappings) {
            var mappingDefinition: MappingDefinition = new MappingDefinition();
            var mappingJSON: any = InitializationService.createExampleMappingsJSON();
            MappingSerializer.deserializeMappingServiceJSON(mappingJSON, mappingDefinition, this.cfg);
            this.cfg.mappings = mappingDefinition;
            console.log("INIT SERVICE TEST DATA: Loaded mock mapping definition from example JSON",
                { "mappingDef": mappingDefinition, "JSON": mappingJSON }
            );
        }

        if (InitializationService.addMockActionConfig) {
            console.error("INIT SERVICE TEST DATA: Action config mode enabled.");
            this.addMockActionConfigs();
        }

        //load field actions
        this.fetchFieldActions();

        //load documents
        if (this.cfg.initCfg.classPath) {
            console.log("Classpath already provided, skipping Maven loading.");
            this.fetchDocuments();
        } else {
            console.log("Loading class path from Maven.");
            this.updateLoadingStatus("Loading Maven class path.");
            console.log(this.cfg.initCfg.loadingStatus);
            //fetch class path
            this.cfg.documentService.fetchClassPath().subscribe(
                (classPath: string) => {
                    this.cfg.initCfg.classPath = classPath;
                    console.log("ClassPath was fetched: " + classPath);
                    this.fetchDocuments();
                    this.updateStatus();
                },
                (error: any) => { this.handleError("could not load Maven class path.", error) }
            );
        }

        //load mappings
        if (this.cfg.mappings != null) {
            console.log("Mapping data already provided, not loading.");
            this.mappingInitialized = true;
            this.updateStatus();
        } else {
            this.cfg.mappings = new MappingDefinition();
            if (this.cfg.mappingFiles.length > 0) {
                this.fetchMappings(this.cfg.mappingFiles);
            } else {
                console.log("Discovering mapping files.");
                this.cfg.mappingService.findMappingFiles("UI").subscribe(
                    (files: string[]) => { this.fetchMappings(files); },
                    (error: any) => { this.handleError("could not load mapping files.", error) }
                );
            }
        }
    }

    private fetchDocuments(): void {
        this.updateLoadingStatus("Loading source/target documents.");
        console.log("Loading source/target documents.");
        for (let docDef of this.cfg.getAllDocs()) {
            if (docDef == this.cfg.propertyDoc || docDef == this.cfg.constantDoc) {
                docDef.initCfg.initialized = true;
                continue;
            }
            this.cfg.documentService.fetchDocument(docDef, this.cfg.initCfg.classPath).subscribe(
                (docDef: DocumentDefinition) => {
                    console.log("Document was loaded: " + docDef.fullyQualifiedName, docDef);
                    this.updateStatus();
                },
                (error: any) => { this.handleError("Could not load document '"
                    + docDef.initCfg.documentIdentifier + "'.", error) }
            );
        }
    }

    private fetchMappings(mappingFiles: string[]): void {
        console.log("Loading mappings from files: " + mappingFiles, mappingFiles);
        if (mappingFiles.length == 0) {
            console.log("No mapping files to load.")
            this.mappingInitialized = true;
            this.updateStatus();
            return;
        }
        this.cfg.mappingService.fetchMappings(mappingFiles, this.cfg.mappings).subscribe(
            (result:boolean) => {
                console.log("Finished loading mapping files.");
                this.mappingInitialized = true;
                this.updateStatus();
            },
            (error: any) => { this.handleError("could not load mapping definitions.", error) }
        );
    }

    private fetchFieldActions(): void {
        console.log("Loading field action configs.");
        this.cfg.fieldActionService.fetchFieldActions().subscribe(
            (actionConfigs: FieldActionConfig[]) => {
                console.log("Field actions were loaded.", actionConfigs);
                TransitionModel.actionConfigs = actionConfigs;
                this.fieldActionsInitialized = true;
                this.updateStatus();
            },
            (error: any) => { this.handleError("Could not load field action configs.", error) }
        );
    }

    private updateStatus(): void {
        var documentCount: number = this.cfg.getAllDocs().length;
        var finishedDocCount: number = 0;
        for (let docDef of this.cfg.getAllDocs()) {
            if (docDef.initCfg.initialized || docDef.initCfg.errorOccurred) {
                finishedDocCount++;
            }
        }

        console.log("Document load status: " + finishedDocCount + " of " + documentCount
            + "\nMapping load status: " + (this.mappingInitialized ? "Loaded" : "Loading")
            + "\Field Action Config load status: " + (this.fieldActionsInitialized ? "Loaded" : "Loading"));

        if ((documentCount == finishedDocCount) && this.mappingInitialized && this.fieldActionsInitialized) {
            console.log("All documents and mappings are loaded, initializing data.");
            this.cfg.mappings.detectTableIdentifiers();
            this.cfg.mappings.updateDocumentNamespacesFromMappings(this.cfg);
            this.cfg.mappings.updateMappingsFromDocuments(this.cfg);
            console.log("Updating fields from mappings.");
            for (let d of this.cfg.getAllDocs()) {
                d.updateFromMappings(this.cfg.mappings, this.cfg);
            }
            this.cfg.mappings.removeStaleMappings(this.cfg);
            this.updateLoadingStatus("Initialization complete.");
            this.cfg.initCfg.initialized = true;
            this.systemInitializedSource.next();
            console.log("Loaded mappings.", this.cfg.mappings);
            console.log("Data Mapper UI finished initializing.", this.cfg);
        }
    }

    private addMockActionConfigs(): void {
        var actionCfg: FieldActionConfig = new FieldActionConfig();
        actionCfg.identifier = "lowercase";
        actionCfg.name = "Lowercase";
        TransitionModel.actionConfigs.push(actionCfg);

        actionCfg = new FieldActionConfig();
        actionCfg.identifier = "uppercase";
        actionCfg.name = "Uppercase";
        TransitionModel.actionConfigs.push(actionCfg);

        actionCfg = new FieldActionConfig();
        actionCfg.identifier = "substring";
        actionCfg.name = "Substring";
        actionCfg.argumentNames = ["Start Index", "Length"];
        TransitionModel.actionConfigs.push(actionCfg);

        actionCfg = new FieldActionConfig();
        actionCfg.identifier = "ceiling";
        actionCfg.name = "Ceiling";
        actionCfg.forString = false;
        TransitionModel.actionConfigs.push(actionCfg);

        actionCfg = new FieldActionConfig();
        actionCfg.identifier = "floor";
        actionCfg.name = "Floor";
        actionCfg.forString = false;
        TransitionModel.actionConfigs.push(actionCfg);

        actionCfg = new FieldActionConfig();
        actionCfg.identifier = "min";
        actionCfg.name = "Min";
        actionCfg.argumentNames = ["Compare To"];
        actionCfg.forString = false;
        TransitionModel.actionConfigs.push(actionCfg);

        actionCfg = new FieldActionConfig();
        actionCfg.identifier = "max";
        actionCfg.name = "Max";
        actionCfg.argumentNames = ["Compare To"];
        actionCfg.forString = false;
        TransitionModel.actionConfigs.push(actionCfg);
    }

    private handleError(message: string, error:any ) {
        message = "Data Mapper UI Initialization Error: " + message;
        console.error(message, error);
        this.updateLoadingStatus(message);
        this.cfg.initCfg.initializationErrorOccurred = true;
        this.updateStatus();
    }

    private updateLoadingStatus(status: string): void {
        this.cfg.initCfg.loadingStatus = status;
        this.initializationStatusChangedSource.next();
    }

    public static createExamplePom(): string {
        var pom: string = `
            <project xmlns="http://maven.apache.org/POM/4.0.0"
                xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">

                <modelVersion>4.0.0</modelVersion>
                <groupId>foo.bar</groupId>
                <artifactId>test.model</artifactId>
                <version>1.10.0</version>
                <packaging>jar</packaging>
                <name>Test :: Model</name>

                <dependencies>
                    <dependency>
                        <groupId>com.fasterxml.jackson.core</groupId>
                        <artifactId>jackson-annotations</artifactId>
                        <version>2.8.5</version>
                    </dependency>
                    <dependency>
                        <groupId>com.fasterxml.jackson.core</groupId>
                        <artifactId>jackson-databind</artifactId>
                        <version>2.8.5</version>
                    </dependency>
                    <dependency>
                        <groupId>com.fasterxml.jackson.core</groupId>
                        <artifactId>jackson-core</artifactId>
                        <version>2.8.5</version>
                    </dependency>
                </dependencies>
            </project>
        `;

        //pom = pom.replace(/\"/g, "\\\"");
        /*
        pom = pom.replace(/\n/g, "\\n");
        pom = pom.replace(/\t/g, "\\t");
        */
        return pom;
    }

    public static createExampleMappingsJSON(): any {
        var json: any = {
            "AtlasMapping": {
                "jsonType": ConfigModel.mappingServicesPackagePrefix + ".AtlasMapping",
                "fieldMappings": {
                    "fieldMapping": [
                        {
                            "jsonType": ConfigModel.mappingServicesPackagePrefix + ".MapFieldMapping",
                            "inputField": {
                                "jsonType": ConfigModel.mappingServicesPackagePrefix + ".MappedField",
                                "field": {
                                    "jsonType": ConfigModel.javaServicesPackagePrefix + ".JavaField",
                                    "status": "SUPPORTED",
                                    "modifiers": { "modifier": [] },
                                    "name": "text",
                                    "className": "java.lang.String",
                                    "type": "STRING",
                                    "getMethod": "getText",
                                    "primitive": true,
                                    "array": false,
                                    "synthetic": false,
                                    "path": "Text"
                                },
                                "fieldActions": null
                            },
                            "outputField": {
                                "jsonType": ConfigModel.mappingServicesPackagePrefix + ".MappedField",
                                "field": {
                                    "jsonType": ConfigModel.javaServicesPackagePrefix + ".JavaField",
                                    "status": "SUPPORTED",
                                    "modifiers": { "modifier": [ "PRIVATE" ] },
                                    "name": "Description",
                                    "className": "java.lang.String",
                                    "type": "STRING",
                                    "getMethod": "getDescription",
                                    "setMethod": "setDescription",
                                    "primitive": true,
                                    "array": false,
                                    "synthetic": false,
                                    "path": "Description"
                                },
                                "fieldActions": null
                            }
                        },
                        {
                            "jsonType": ConfigModel.mappingServicesPackagePrefix + ".SeparateFieldMapping",
                            "inputField": {
                                "jsonType": ConfigModel.mappingServicesPackagePrefix + ".MappedField",
                                "field": {
                                    "jsonType": ConfigModel.javaServicesPackagePrefix + ".JavaField",
                                    "status": "SUPPORTED",
                                    "modifiers": { "modifier": [] },
                                    "name": "name",
                                    "className": "java.lang.String",
                                    "type": "STRING",
                                    "getMethod": "getName",
                                    "primitive": true,
                                    "array": false,
                                    "synthetic": false,
                                    "path": "User.Name"
                                },
                                "fieldActions": null
                            },
                            "outputFields": {
                                "mappedField": [
                                    {
                                        "jsonType": ConfigModel.mappingServicesPackagePrefix + ".MappedField",
                                        "field": {
                                            "jsonType": ConfigModel.javaServicesPackagePrefix + ".JavaField",
                                            "status": "SUPPORTED",
                                            "modifiers": { "modifier": [ "PRIVATE" ] },
                                            "name": "FirstName",
                                            "className": "java.lang.String",
                                            "type": "STRING",
                                            "getMethod": "getFirstName",
                                            "setMethod": "setFirstName",
                                            "primitive": true,
                                            "array": false,
                                            "synthetic": false,
                                            "path": "FirstName"
                                        },
                                        "fieldActions": {
                                            "fieldAction": [ {
                                                "jsonType": ConfigModel.mappingServicesPackagePrefix + ".MapAction",
                                                "index": 0
                                            } ]
                                        }
                                    },
                                    {
                                        "jsonType": ConfigModel.mappingServicesPackagePrefix + ".MappedField",
                                        "field": {
                                            "jsonType": ConfigModel.javaServicesPackagePrefix + ".JavaField",
                                            "status": "SUPPORTED",
                                            "modifiers": {
                                            "modifier": [ "PRIVATE" ] },
                                            "name": "LastName",
                                            "className": "java.lang.String",
                                            "type": "STRING",
                                            "getMethod": "getLastName",
                                            "setMethod": "setLastName",
                                            "primitive": true,
                                            "array": false,
                                            "synthetic": false,
                                            "path": "LastName"
                                        },
                                        "fieldActions": {
                                            "fieldAction": [ {
                                                "jsonType": ConfigModel.mappingServicesPackagePrefix + ".MapAction",
                                                "index": 1
                                            } ]
                                        }
                                    }
                                ]
                            },
                            "strategy": "SPACE"
                        },
                        {
                            "jsonType": ConfigModel.mappingServicesPackagePrefix + ".MapFieldMapping",
                            "inputField": {
                                "jsonType": ConfigModel.mappingServicesPackagePrefix + ".MappedField",
                                "field": {
                                    "jsonType": ConfigModel.javaServicesPackagePrefix + ".JavaField",
                                    "status": "SUPPORTED",
                                    "modifiers": { "modifier": [] },
                                    "name": "screenName",
                                    "className": "java.lang.String",
                                    "type": "STRING",
                                    "getMethod": "getScreenName",
                                    "primitive": true,
                                    "array": false,
                                    "synthetic": false,
                                    "path": "User.ScreenName"
                                },
                                "fieldActions": null
                            },
                            "outputField": {
                                "jsonType": ConfigModel.mappingServicesPackagePrefix + ".MappedField",
                                "field": {
                                    "jsonType": ConfigModel.javaServicesPackagePrefix + ".JavaField",
                                    "status": "SUPPORTED",
                                    "modifiers": {
                                    "modifier": [ "PRIVATE" ] },
                                    "name": "Title",
                                    "className": "java.lang.String",
                                    "type": "STRING",
                                    "getMethod": "getTitle",
                                    "setMethod": "setTitle",
                                    "primitive": true,
                                    "array": false,
                                    "synthetic": false,
                                    "path": "Title"
                                },
                                "fieldActions": null
                            }
                        }
                    ]
                },
                "name": "UI.867332",
                "sourceUri": "atlas:java?className=twitter4j.Status",
                "targetUri": "atlas:java?className=org.apache.camel.salesforce.dto.Contact",
                "lookupTables": { "lookupTable": [] }
            }
        }
        return json;
    }
}
