import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AppShellComponent } from '../../shared/app-shell.component';
import {
    GeneratedArtifactRecord,
    GeneratedFile,
    GeneratedResult,
    InterfaceScreen,
    Project
} from '../../core/models/app.models';
import { ProjectService } from '../../core/services/project.service';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';

@Component({
    standalone: true,
    imports: [
        CommonModule,
        RouterLink,
        AppShellComponent
    ],
    templateUrl: './project-result.component.html',
    styleUrl: './project-result.component.scss'
})
export class ProjectResultComponent implements OnInit {
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private readonly sanitizer = inject(DomSanitizer);

    readonly projectService = inject(ProjectService);
    private readonly api = inject(ApiService);
    readonly toast = inject(ToastService);

    project?: Project;
    activeInterface?: InterfaceScreen;
    result?: GeneratedResult;
    artifact?: GeneratedArtifactRecord;

    generatedFiles: GeneratedFile[] = [];
    selectedFileIndex = signal(0);
    tab = signal<'design' | 'code' | 'json'>('design');

    previewUrl?: SafeResourceUrl;
    hasPreview = false;

    loading = true;
    error = '';

    private previewObjectUrl?: string;

    async ngOnInit(): Promise<void> {
        const id = this.route.snapshot.paramMap.get('id');
        const artifactId =
            this.route.snapshot.queryParamMap.get('artifactId');

        if (!id || !artifactId) {
            this.error =
                'The project or artifact ID is missing from the route.';
            this.loading = false;
            return;
        }

        try {
            this.project =
                await this.projectService.loadProject(id);

            if (!this.project) {
                this.error = 'Project not found.';
                return;
            }

            await this.projectService.loadArtifacts(id);

            const interfaces =
                this.projectService.getInterfaces(id);

            this.artifact =
                await this.projectService.getArtifact(
                    id,
                    artifactId
                );

            if (!this.artifact) {
                await this.router.navigate([
                    '/projects',
                    id,
                    'workspace'
                ]);
                return;
            }

            this.artifact =
                await this.projectService.getArtifact(
                    id,
                    artifactId,
                    true
                );

            const interfaceId =
                this.route.snapshot.queryParamMap.get(
                    'interface'
                ) ?? this.artifact.id;

            const interfaceName =
                this.route.snapshot.queryParamMap.get(
                    'interfaceName'
                );

            this.activeInterface = {
                id: interfaceId,
                name:
                    interfaceName ??
                    this.artifact.name ??
                    this.artifact.output?.title ??
                    this.artifact.artifact_type,
                type: 'Desktop',
                artifactId: this.artifact.id
            };

            if (!interfaceName) {
                const existingInterface =
                    interfaces.find(
                        item =>
                            item.artifactId ===
                            this.artifact?.id
                    );

                if (existingInterface) {
                    this.activeInterface =
                        existingInterface;
                }
            }

            this.result =
                this.toGeneratedResult(this.artifact);

            this.generatedFiles =
                this.getGeneratedFiles(this.artifact);

            this.selectedFileIndex.set(0);

            this.buildPreview();
        } catch (err: any) {
            this.error =
                err?.error?.detail ??
                'Unable to load generated artifact.';
        } finally {
            this.loading = false;
        }
    }

    async regenerate(): Promise<void> {
        if (
            !this.project ||
            !this.activeInterface ||
            !this.result
        ) {
            return;
        }

        try {
            const artifactType =
                this.artifact?.artifact_type ??
                'html';

            const artifact =
                await this.projectService.generate(
                    this.project.id,
                    this.result.design.description,
                    artifactType,
                    this.activeInterface.name
                );

            await this.router.navigate(
                [
                    '/projects',
                    this.project.id,
                    'workspace',
                    'result'
                ],
                {
                    queryParams: {
                        artifactId: artifact.id,
                        interface:
                        this.activeInterface.id
                    }
                }
            );
        } catch (err: any) {
            this.toast.show(
                err?.error?.detail ??
                'Generation failed.'
            );
        }
    }

    selectedFile(): GeneratedFile | undefined {
        return (
            this.generatedFiles[
                this.selectedFileIndex()
                ] ??
            this.generatedFiles[0]
        );
    }

    selectFile(index: number): void {
        this.selectedFileIndex.set(index);
    }

    displayedCode(): string {
        return (
            this.selectedFile()?.content ??
            this.result?.code.content ??
            ''
        );
    }

    displayedFileName(): string {
        return (
            this.selectedFile()?.path ??
            this.selectedFile()?.name ??
            this.result?.code.fileName ??
            'generated.txt'
        );
    }

    async copyCode(): Promise<void> {
        if (!this.result) {
            return;
        }

        try {
            await navigator.clipboard.writeText(
                this.displayedCode()
            );

            this.toast.show(
                'Code copied to clipboard.'
            );
        } catch {
            this.toast.show(
                'Clipboard access is unavailable in this browser.'
            );
        }
    }

    downloadCode(): void {
        if (!this.result) {
            return;
        }

        this.downloadBlob(
            this.displayedCode(),
            this.displayedFileName(),
            this.mimeTypeForFile(
                this.selectedFile()
            )
        );

        this.toast.show('Code downloaded.');
    }

    downloadZip(): void {
        if (
            !this.project ||
            !this.result?.artifactId
        ) {
            return;
        }

        this.api
            .downloadArtifactZip(
                this.project.id,
                this.result.artifactId
            )
            .subscribe({
                next: blob => {
                    if (!this.result) {
                        return;
                    }

                    this.downloadBlob(
                        blob,
                        this.result.zipName,
                        'application/zip'
                    );

                    this.toast.show(
                        'ZIP package downloaded.'
                    );
                },
                error: () => {
                    this.toast.show(
                        'Unable to download ZIP package.'
                    );
                }
            });
    }

    private buildPreview(): void {
        const htmlFile =
            this.findHtmlFile();

        if (!htmlFile?.content) {
            this.hasPreview = false;
            this.previewUrl = undefined;
            return;
        }

        if (this.previewObjectUrl) {
            URL.revokeObjectURL(
                this.previewObjectUrl
            );

            this.previewObjectUrl = undefined;
        }

        const documentHtml =
            this.buildPreviewDocument(
                htmlFile.content
            );

        const blob =
            new Blob(
                [documentHtml],
                {
                    type: 'text/html;charset=utf-8'
                }
            );

        this.previewObjectUrl =
            URL.createObjectURL(blob);

        this.previewUrl =
            this.sanitizer
                .bypassSecurityTrustResourceUrl(
                    this.previewObjectUrl
                );

        this.hasPreview = true;
    }

    private findHtmlFile():
        GeneratedFile | undefined {
        const htmlFiles =
            this.generatedFiles.filter(
                file => {
                    const name = (
                        file.path ??
                        file.name ??
                        ''
                    ).toLowerCase();

                    return (
                        name.endsWith('.html') ||
                        name.endsWith('.htm') ||
                        file.language?.toLowerCase() ===
                        'html'
                    );
                }
            );

        return (
            htmlFiles.find(file =>
                this.isMainHtmlFile(file)
            ) ??
            htmlFiles[0]
        );
    }

    private isMainHtmlFile(
        file: GeneratedFile
    ): boolean {
        const name = (
            file.path ??
            file.name ??
            ''
        )
            .split('/')
            .pop()
            ?.toLowerCase();

        return (
            name === 'index.html' ||
            name === 'index.htm' ||
            name === 'main.html' ||
            name === 'app.html'
        );
    }

    private buildPreviewDocument(
        html: string
    ): string {
        let documentHtml = html;

        const cssFiles =
            this.generatedFiles.filter(
                file => this.isCssFile(file)
            );

        const jsFiles =
            this.generatedFiles.filter(
                file => this.isJsFile(file)
            );

        const jsonFiles =
            this.generatedFiles.filter(
                file => this.isJsonFile(file)
            );

        if (!/<html[\s>]/i.test(documentHtml)) {
            documentHtml = `
<!doctype html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body>
${documentHtml}
</body>
</html>
`;
        }

        for (const file of cssFiles) {
            const fileName =
                this.fileName(file);

            if (!fileName) {
                continue;
            }

            const escapedName =
                this.escapeRegExp(fileName);

            const linkRegex =
                new RegExp(
                    `<link\\b[^>]*href=["'][^"']*${escapedName}["'][^>]*>`,
                    'gi'
                );

            documentHtml =
                documentHtml.replace(
                    linkRegex,
                    ''
                );
        }

        const styles =
            cssFiles
                .map(
                    file => `
<style data-generated-file="${this.escapeHtmlAttribute(
                        this.fileName(file)
                    )}">
${file.content}
</style>`
                )
                .join('\n');

        if (styles) {
            if (/<\/head>/i.test(documentHtml)) {
                documentHtml =
                    documentHtml.replace(
                        /<\/head>/i,
                        `${styles}</head>`
                    );
            } else {
                documentHtml =
                    `${styles}${documentHtml}`;
            }
        }

        if (jsonFiles.length) {
            const jsonMap: Record<string, string> =
                {};

            for (const file of jsonFiles) {
                const normalizedPath =
                    this.normalizedFilePath(file);

                if (!normalizedPath) {
                    continue;
                }

                const baseName =
                    normalizedPath
                        .split('/')
                        .pop() ??
                    normalizedPath;

                const content =
                    typeof file.content === 'string'
                        ? file.content
                        : '';

                jsonMap[normalizedPath] =
                    content;

                jsonMap[baseName] =
                    content;
            }

            const jsonBridge = `
<script>
(function () {
    const generatedJsonFiles = ${JSON.stringify(
                jsonMap
            )};

    const originalFetch =
        window.fetch.bind(window);

    window.fetch = function (input, init) {
        let requestUrl = '';

        if (typeof input === 'string') {
            requestUrl = input;
        } else if (
            input &&
            typeof input.url === 'string'
        ) {
            requestUrl = input.url;
        }

        try {
            const parsedUrl = new URL(
                requestUrl,
                window.location.href
            );

            const path =
                parsedUrl.pathname
                    .replace(/^\\//, '')
                    .replace(/^\\.\\//, '');

            const baseName =
                path.split('/').pop() || path;

            const jsonContent =
                generatedJsonFiles[path] ??
                generatedJsonFiles[baseName];

            if (jsonContent !== undefined) {
                return Promise.resolve(
                    new Response(
                        jsonContent,
                        {
                            status: 200,
                            headers: {
                                'Content-Type':
                                    'application/json'
                            }
                        }
                    )
                );
            }
        } catch (error) {
            console.warn(
                'Generated JSON fetch bridge error:',
                error
            );
        }

        return originalFetch(
            input,
            init
        );
    };
})();
</script>
`;

            if (/<head[^>]*>/i.test(documentHtml)) {
                documentHtml =
                    documentHtml.replace(
                        /<head[^>]*>/i,
                        match =>
                            `${match}${jsonBridge}`
                    );
            } else {
                documentHtml =
                    `${jsonBridge}${documentHtml}`;
            }
        }

        const externalScripts: string[] = [];

        const externalScriptRegex =
            /<script\b[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script\s*>/gi;

        let externalMatch:
            RegExpExecArray | null;

        while (
            (externalMatch =
                externalScriptRegex.exec(
                    documentHtml
                )) !== null
            ) {
            const src =
                externalMatch[1];

            if (
                src &&
                /^https?:\/\//i.test(src)
            ) {
                externalScripts.push(src);
            }
        }

        documentHtml =
            documentHtml.replace(
                externalScriptRegex,
                (
                    fullMatch,
                    src: string
                ) => {
                    if (
                        src &&
                        /^https?:\/\//i.test(src)
                    ) {
                        return '';
                    }

                    return fullMatch;
                }
            );

        for (const file of jsFiles) {
            const fileName =
                this.fileName(file);

            if (!fileName) {
                continue;
            }

            const escapedName =
                this.escapeRegExp(fileName);

            const scriptRegex =
                new RegExp(
                    `<script\\b[^>]*src=["'][^"']*${escapedName}["'][^>]*>[\\s\\S]*?<\\/script\\s*>`,
                    'gi'
                );

            documentHtml =
                documentHtml.replace(
                    scriptRegex,
                    ''
                );
        }

        const dependencyScripts =
            externalScripts
                .filter(
                    (src, index, array) =>
                        array.indexOf(src) === index
                )
                .map(
                    src => `
<script
    src="${this.escapeHtmlAttribute(src)}">
</script>`
                )
                .join('\n');

        if (dependencyScripts) {
            if (/<\/head>/i.test(documentHtml)) {
                documentHtml =
                    documentHtml.replace(
                        /<\/head>/i,
                        `${dependencyScripts}</head>`
                    );
            } else {
                documentHtml =
                    `${dependencyScripts}${documentHtml}`;
            }
        }

        const generatedScripts =
            jsFiles
                .map(
                    file => `
<script>
${file.content}
</script>`
                )
                .join('\n');

        if (generatedScripts) {
            if (/<\/body>/i.test(documentHtml)) {
                documentHtml =
                    documentHtml.replace(
                        /<\/body>/i,
                        `${generatedScripts}</body>`
                    );
            } else {
                documentHtml +=
                    generatedScripts;
            }
        }

        if (
            !/<meta[^>]+name=["']viewport["']/i.test(
                documentHtml
            )
        ) {
            const viewport =
                '<meta name="viewport" content="width=device-width, initial-scale=1.0">';

            if (/<head[^>]*>/i.test(documentHtml)) {
                documentHtml =
                    documentHtml.replace(
                        /<head[^>]*>/i,
                        match =>
                            `${match}${viewport}`
                    );
            }
        }

        return documentHtml;
    }

    private normalizedFilePath(
        file: GeneratedFile
    ): string {
        return (
            file.path ??
            file.name ??
            ''
        )
            .replace(/\\/g, '/')
            .replace(/^\.?\//, '');
    }

    private isJsonFile(
        file: GeneratedFile
    ): boolean {
        const name = (
            file.path ??
            file.name ??
            ''
        ).toLowerCase();

        return (
            name.endsWith('.json') ||
            file.language?.toLowerCase() ===
            'json'
        );
    }

    private isCssFile(
        file: GeneratedFile
    ): boolean {
        const name = (
            file.path ??
            file.name ??
            ''
        ).toLowerCase();

        return (
            name.endsWith('.css') ||
            file.language?.toLowerCase() ===
            'css'
        );
    }

    private isJsFile(
        file: GeneratedFile
    ): boolean {
        const name = (
            file.path ??
            file.name ??
            ''
        ).toLowerCase();

        const language =
            file.language?.toLowerCase();

        return (
            name.endsWith('.js') ||
            name.endsWith('.mjs') ||
            language === 'javascript' ||
            language === 'js'
        );
    }

    private fileName(
        file: GeneratedFile
    ): string {
        return (
            file.path ??
            file.name ??
            ''
        )
            .replace(/\\/g, '/')
            .split('/')
            .pop() ?? '';
    }

    private escapeHtmlAttribute(
        value: string
    ): string {
        return value
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    private escapeRegExp(
        value: string
    ): string {
        return value.replace(
            /[.*+?^${}()|[\]\\]/g,
            '\\$&'
        );
    }

    private mimeTypeForFile(
        file?: GeneratedFile
    ): string {
        const name = (
            file?.path ??
            file?.name ??
            ''
        ).toLowerCase();

        if (name.endsWith('.html')) {
            return 'text/html;charset=utf-8';
        }

        if (name.endsWith('.css')) {
            return 'text/css;charset=utf-8';
        }

        if (
            name.endsWith('.js') ||
            name.endsWith('.mjs')
        ) {
            return 'text/javascript;charset=utf-8';
        }

        if (name.endsWith('.json')) {
            return 'application/json;charset=utf-8';
        }

        return 'text/plain;charset=utf-8';
    }

    private toGeneratedResult(
        record: GeneratedArtifactRecord
    ): GeneratedResult {
        const output: any =
            record.output ?? {};

        const files =
            Array.isArray(output.files)
                ? output.files
                : [];

        const legacyDesign =
            output.design ?? {};

        const legacyCode =
            output.code ?? {};

        const first: any =
            files.find(
                (file: any) =>
                    typeof file?.content ===
                    'string'
            ) ??
            files[0];

        return {
            design: {
                title:
                    output.title ??
                    legacyDesign.title ??
                    record.artifact_type ??
                    'Generated interface',

                description:
                    output.description ??
                    legacyDesign.description ??
                    record.prompt ??
                    'Generated interface',

                primaryColor:
                    output.primaryColor ??
                    legacyDesign.primaryColor ??
                    '#6A5CF5',

                components:
                    Array.isArray(
                        output.components
                    )
                        ? output.components
                        : Array.isArray(
                            legacyDesign.components
                        )
                            ? legacyDesign.components
                            : files
                                .map(
                                    (file: any) =>
                                        file.name ??
                                        file.path
                                )
                                .filter(Boolean)
                                .slice(0, 6)
            },

            code: {
                language:
                    first?.language ??
                    legacyCode.language ??
                    'text',

                fileName:
                    first?.name ??
                    first?.path ??
                    legacyCode.fileName ??
                    'generated.txt',

                content:
                    first?.content ??
                    legacyCode.content ??
                    ''
            },

            zipName:
                output.zipName ??
                `${record.id}.zip`,

            generatedAt:
                record.created_at
                    ? new Date(
                        record.created_at
                    ).toLocaleString(
                        'en-GB',
                        {
                            dateStyle: 'medium',
                            timeStyle: 'short'
                        }
                    )
                    : new Date().toLocaleString(
                        'en-GB',
                        {
                            dateStyle: 'medium',
                            timeStyle: 'short'
                        }
                    ),

            artifactId: record.id,
            raw: record
        };
    }

    private getGeneratedFiles(
        record: GeneratedArtifactRecord
    ): GeneratedFile[] {
        const outputFiles =
            Array.isArray(
                record.output?.files
            )
                ? record.output.files
                : [];

        const recordFiles =
            Array.isArray(record.files)
                ? record.files
                : [];

        const files =
            outputFiles.length
                ? outputFiles
                : recordFiles;

        return files
            .filter(
                file =>
                    typeof file?.content ===
                    'string'
            )
            .map((file, index) => ({
                ...file,
                name:
                    file.name ??
                    file.path ??
                    `file-${index + 1}.${file.language ?? 'txt'}`
            }));
    }

    private downloadBlob(
        data: BlobPart,
        name: string,
        type: string
    ): void {
        const blob =
            new Blob(
                [data],
                { type }
            );

        const url =
            URL.createObjectURL(blob);

        const anchor =
            document.createElement('a');

        anchor.href = url;
        anchor.download = name;
        anchor.click();

        URL.revokeObjectURL(url);
    }
}