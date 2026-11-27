/**
 * GENERATED - DO NOT EDIT.
 * Source: backend/openapi.json (regenerate with `pnpm gen:client` or `make gen-client`).
 * Hand edits are overwritten and fail the CI drift check.
 */

export type paths = {
    "/api/v1/health/live": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Liveness probe */
        get: operations["health_get_live"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/health/ready": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Readiness probe (checks the database) */
        get: operations["health_get_ready"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/version": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Service version and build commit */
        get: operations["health_get_version"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
};
export type webhooks = Record<string, never>;
export type components = {
    schemas: {
        /** ErrorBody */
        ErrorBody: {
            /** Code */
            code: string;
            /**
             * Details
             * @default []
             */
            details: components["schemas"]["ErrorDetail"][];
            /** Message */
            message: string;
            /** Request Id */
            request_id?: string | null;
        };
        /** ErrorDetail */
        ErrorDetail: {
            /** Field */
            field?: string | null;
            /** Issue */
            issue: string;
        };
        /**
         * ErrorResponse
         * @description Body of every non-2xx response.
         */
        ErrorResponse: {
            error: components["schemas"]["ErrorBody"];
        };
        /** LiveRead */
        LiveRead: {
            /**
             * Status
             * @default ok
             * @constant
             */
            status: "ok";
        };
        /** ReadyRead */
        ReadyRead: {
            /** Checks */
            checks: {
                [key: string]: "ok" | "fail";
            };
            /**
             * Status
             * @default ok
             * @constant
             */
            status: "ok";
        };
        /** VersionRead */
        VersionRead: {
            /** Commit */
            commit: string;
            /** Version */
            version: string;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
};
export type $defs = Record<string, never>;
export interface operations {
    health_get_live: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LiveRead"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    health_get_ready: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReadyRead"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Service Unavailable */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    health_get_version: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VersionRead"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
}
