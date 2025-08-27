// Standardized API response utility
export class ApiResponseBuilder {
    static success(data, message) {
        return {
            ok: true,
            data,
            message,
            timestamp: new Date().toISOString()
        };
    }
    static error(error, data) {
        return {
            ok: false,
            error,
            data,
            timestamp: new Date().toISOString()
        };
    }
    static validation(error) {
        return {
            ok: false,
            error: `Validation error: ${error}`,
            timestamp: new Date().toISOString()
        };
    }
    static unauthorized(message = 'Unauthorized access') {
        return {
            ok: false,
            error: message,
            timestamp: new Date().toISOString()
        };
    }
    static notFound(resource = 'Resource') {
        return {
            ok: false,
            error: `${resource} not found`,
            timestamp: new Date().toISOString()
        };
    }
    static serverError(message = 'Internal server error') {
        return {
            ok: false,
            error: message,
            timestamp: new Date().toISOString()
        };
    }
}
