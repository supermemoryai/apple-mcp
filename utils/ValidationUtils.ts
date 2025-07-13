/**
 * Input validation and sanitization utilities for the contacts module
 */

/**
 * Validates and sanitizes a contact name input
 * @param name - The contact name to validate
 * @returns Sanitized name or throws error if invalid
 */
export function validateContactName(name: string): string {
    if (typeof name !== 'string') {
        throw new Error('Contact name must be a string');
    }
    
    // Trim whitespace
    const trimmed = name.trim();
    
    // Check if empty
    if (trimmed.length === 0) {
        throw new Error('Contact name cannot be empty');
    }
    
    // Check reasonable length limits
    if (trimmed.length > 200) {
        throw new Error('Contact name is too long (maximum 200 characters)');
    }
    
    // Check for null bytes and other control characters that could cause issues
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(trimmed)) {
        throw new Error('Contact name contains invalid control characters');
    }
    
    return trimmed;
}

/**
 * Validates a phone number input
 * @param phoneNumber - The phone number to validate
 * @returns Sanitized phone number or throws error if invalid
 */
export function validatePhoneNumber(phoneNumber: string): string {
    if (typeof phoneNumber !== 'string') {
        throw new Error('Phone number must be a string');
    }
    
    const trimmed = phoneNumber.trim();
    
    if (trimmed.length === 0) {
        throw new Error('Phone number cannot be empty');
    }
    
    // Allow reasonable phone number characters: digits, +, -, (, ), spaces, .
    if (!/^[+\d\-\(\)\s\.]+$/.test(trimmed)) {
        throw new Error('Phone number contains invalid characters');
    }
    
    // Check reasonable length
    if (trimmed.length > 30) {
        throw new Error('Phone number is too long (maximum 30 characters)');
    }
    
    return trimmed;
}

/**
 * Safely escapes a string for use in logging to prevent log injection
 * @param input - The string to escape for logging
 * @returns Escaped string safe for logging
 */
export function escapeForLogging(input: string): string {
    return input
        .replace(/\r\n/g, '\\r\\n')
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n')
        .replace(/\t/g, '\\t');
} 