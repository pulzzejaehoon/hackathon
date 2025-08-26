// Standardized API response utility

export interface ApiResponse<T = any> {
  ok: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp?: string;
}

export class ApiResponseBuilder {
  static success<T>(data?: T, message?: string): ApiResponse<T> {
    return {
      ok: true,
      data,
      message,
      timestamp: new Date().toISOString()
    };
  }

  static error(error: string, data?: any): ApiResponse {
    return {
      ok: false,
      error,
      data,
      timestamp: new Date().toISOString()
    };
  }

  static validation(error: string): ApiResponse {
    return {
      ok: false,
      error: `Validation error: ${error}`,
      timestamp: new Date().toISOString()
    };
  }

  static unauthorized(message = 'Unauthorized access'): ApiResponse {
    return {
      ok: false,
      error: message,
      timestamp: new Date().toISOString()
    };
  }

  static notFound(resource = 'Resource'): ApiResponse {
    return {
      ok: false,
      error: `${resource} not found`,
      timestamp: new Date().toISOString()
    };
  }

  static serverError(message = 'Internal server error'): ApiResponse {
    return {
      ok: false,
      error: message,
      timestamp: new Date().toISOString()
    };
  }
}