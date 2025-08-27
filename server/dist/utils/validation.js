// Environment and input validation utilities
export class ValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ValidationError';
    }
}
export class EnvironmentValidator {
    static requiredEnvVars = [
        'JWT_SECRET'
    ];
    static criticalEnvVars = [
        'INTERACTOR_API_KEY' // Important but not critical for development
    ];
    static optionalEnvVars = [
        'OPENROUTER_API_KEY',
        'OPENAI_BASE_URL',
        'FRONTEND_ORIGIN',
        'BACKEND_ORIGIN',
        'PORT'
    ];
    static validate() {
        console.log('🔍 Validating environment configuration...');
        const missing = [];
        const warnings = [];
        // Check required variables
        this.requiredEnvVars.forEach(varName => {
            if (!process.env[varName]) {
                missing.push(varName);
            }
            else {
                console.log(`✅ ${varName}: configured`);
            }
        });
        // Check critical variables (important but not required for development)
        this.criticalEnvVars.forEach(varName => {
            if (!process.env[varName]) {
                console.warn(`⚠️  ${varName}: not configured (using mock data for development)`);
                warnings.push(varName);
            }
            else {
                console.log(`✅ ${varName}: configured`);
            }
        });
        // Check optional but recommended variables
        this.optionalEnvVars.forEach(varName => {
            if (!process.env[varName]) {
                warnings.push(varName);
            }
            else {
                console.log(`✅ ${varName}: configured`);
            }
        });
        // Report results
        if (missing.length > 0) {
            console.error('❌ Missing required environment variables:');
            missing.forEach(varName => {
                console.error(`   - ${varName}`);
            });
            console.error('\n💡 Please create a .env file in the server directory with these variables.');
            throw new ValidationError(`Missing required environment variables: ${missing.join(', ')}`);
        }
        if (warnings.length > 0) {
            console.warn('⚠️  Optional environment variables not set:');
            warnings.forEach(varName => {
                console.warn(`   - ${varName}`);
            });
            console.warn('💡 These are optional but recommended for full functionality.\n');
        }
        console.log('✅ Environment validation completed successfully\n');
    }
    static getConfig() {
        return {
            port: process.env.PORT || 3001,
            nodeEnv: process.env.NODE_ENV || 'development',
            jwtSecret: process.env.JWT_SECRET,
            interactorApiKey: process.env.INTERACTOR_API_KEY,
            interactorBaseUrl: process.env.INTERACTOR_BASE_URL || 'https://console.interactor.com/api/v1',
            openRouterApiKey: process.env.OPENROUTER_API_KEY,
            openAiBaseUrl: process.env.OPENAI_BASE_URL || 'https://openrouter.ai/api/v1',
            frontendOrigin: process.env.FRONTEND_ORIGIN,
            backendOrigin: process.env.BACKEND_ORIGIN
        };
    }
}
export class InputValidator {
    static email(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
    static password(password) {
        if (password.length < 8)
            return 'Password must be at least 8 characters long';
        if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
            return 'Password must contain at least one lowercase, one uppercase, and one number';
        }
        return null;
    }
    static required(value, fieldName) {
        if (!value || (typeof value === 'string' && value.trim() === '')) {
            throw new ValidationError(`${fieldName} is required`);
        }
    }
    static integrationId(id) {
        const allowedIds = ['googlecalendar', 'gmail', 'googledrive'];
        return allowedIds.includes(id);
    }
}
