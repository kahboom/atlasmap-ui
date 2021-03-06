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

import { MappingDefinition } from './mapping.definition.model';
import { DocumentDefinition, DocumentTypes, DocumentType } from './document.definition.model';
import { LookupTable } from '../models/lookup.table.model';

import { ErrorHandlerService } from '../services/error.handler.service';
import { DocumentManagementService } from '../services/document.management.service';
import { MappingManagementService } from '../services/mapping.management.service';
import { InitializationService } from '../services/initialization.service';
import { ValidationService } from '../services/validation.service';
import { FieldActionService } from '../services/field.action.service';

export class DataMapperInitializationModel {
    public initialized: boolean = false;
    public loadingStatus: string = "Loading."
    public initializationErrorOccurred: boolean = false;

    public baseJavaInspectionServiceUrl: string;
    public baseXMLInspectionServiceUrl: string;
    public baseMappingServiceUrl: string;
    public baseValidationServiceUrl: string;
    public baseFieldMappingServiceUrl: string;

    /* class path fetching configuration */
    public classPathFetchTimeoutInMilliseconds: number = 30000;
    // if classPath is specified, maven call to resolve pom will be skipped
    public pomPayload: string;

    public classPath: string;

    /* inspection service filtering flags */
    public fieldNameBlacklist: string[] = [];
    public classNameBlacklist: string[] = [];
    public disablePrivateOnlyFields: boolean = false;
    public disableProtectedOnlyFields: boolean = false;
    public disablePublicOnlyFields: boolean = false;
    public disablePublicGetterSetterFields: boolean = false;
}

export class ConfigModel {
    private static cfg: ConfigModel = new ConfigModel();
    public static mappingServicesPackagePrefix: string = "io.atlasmap.v2";
    public static javaServicesPackagePrefix: string = "io.atlasmap.java.v2";

    public initCfg: DataMapperInitializationModel = new DataMapperInitializationModel;

    /* current ui state config */
    public showMappingDetailTray: boolean = false;
    public showMappingTable: boolean = false;
    public showNamespaceTable: boolean = false;
    public showLinesAlways: boolean = false;
    public showTypes: boolean = false;
    public showMappedFields: boolean = true;
    public showUnmappedFields: boolean = true;

    /* debug logging toggles */
    public debugDocumentJSON: boolean = false;
    public debugDocumentParsing: boolean = false;
    public debugMappingJSON: boolean = true;
    public debugClassPathJSON: boolean = false;
    public debugValidationJSON: boolean = false;
    public debugFieldActionJSON: boolean = true;

    public documentService: DocumentManagementService;
    public mappingService: MappingManagementService;
    public errorService: ErrorHandlerService;
    public initializationService: InitializationService;
    public validationService: ValidationService;
    public fieldActionService: FieldActionService

    public sourceDocs: DocumentDefinition[] = [];
    public targetDocs: DocumentDefinition[] = [];
    public propertyDoc: DocumentDefinition = new DocumentDefinition();
    public constantDoc: DocumentDefinition = new DocumentDefinition();
    public mappingFiles: string[] = [];

    public mappings: MappingDefinition = null;

    constructor() {
        this.propertyDoc.initCfg.type.type = DocumentTypes.PROPERTY;
        this.propertyDoc.name = "Properties";
        this.propertyDoc.isSource = true;
        this.constantDoc.initCfg.type.type = DocumentTypes.CONSTANT;
        this.constantDoc.name = "Constants";
        this.constantDoc.isSource = true;
    }

    public static getConfig(): ConfigModel {
        return ConfigModel.cfg;
    }

    public addJavaDocument(documentIdentifier: string, isSource: boolean) {
        var docDef: DocumentDefinition = new DocumentDefinition();
        docDef.isSource = isSource;
        docDef.initCfg.documentIdentifier = documentIdentifier;
        docDef.initCfg.type.type = DocumentTypes.JAVA;
        if (isSource) {
            this.sourceDocs.push(docDef);
        } else {
            this.targetDocs.push(docDef);
        }
    }

    public addXMLDocument(identifier: string, documentContents: string, isSource: boolean, schemaInspection: boolean) {
        var docDef: DocumentDefinition = new DocumentDefinition();        
        docDef.isSource = isSource;
        docDef.initCfg.pathSeparator = "/";
        docDef.initCfg.shortIdentifier = identifier;
        docDef.initCfg.documentIdentifier = identifier;
        docDef.uri = identifier;
        docDef.initCfg.type.type = DocumentTypes.XML;
        docDef.initCfg.xmlData = documentContents;
        docDef.initCfg.xmlInspectionType = schemaInspection ? "SCHEMA" : "INSTANCE";
        if (isSource) {
            this.sourceDocs.push(docDef);
        } else {
            this.targetDocs.push(docDef);
        }
    }

    public getDocsWithoutPropertyDoc(isSource: boolean): DocumentDefinition[] {
        return [].concat(isSource ? this.sourceDocs : this.targetDocs);
    }

    public getDocs(isSource: boolean): DocumentDefinition[] {
        var docs: DocumentDefinition[] = this.getDocsWithoutPropertyDoc(isSource);
        return isSource ? docs.concat([this.propertyDoc, this.constantDoc]) : docs;
    }

    public getFirstXmlDoc(isSource: boolean) {
        var docs: DocumentDefinition[] = this.getDocsWithoutPropertyDoc(isSource);
        for (let doc of docs) {
            if (doc.initCfg.type.isXML()) {
                return doc;
            }
        }
        return null;
    }

    public getAllDocs(): DocumentDefinition[] {
        return [this.propertyDoc, this.constantDoc].concat(this.sourceDocs).concat(this.targetDocs);
    }

    public documentsAreLoaded(): boolean {
        for (let d of this.getAllDocs()) {
            if (!d.initCfg.initialized) {
                return false;
            }
        }
        return true;
    }
}
