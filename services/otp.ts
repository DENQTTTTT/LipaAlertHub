// services/otp.ts - Fixed OTP service with correct region configuration
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import { app } from "./firebase";

// IMPORTANT: Specify the correct region where your functions are deployed
const functions = getFunctions(app, "asia-southeast1");

// Connect to emulator in development (only if using emulator)
if (process.env.NODE_ENV === "development" && process.env.EXPO_PUBLIC_USE_EMULATOR === "true") {
  try {
    connectFunctionsEmulator(functions, "localhost", 5001);
    console.log("Connected to Functions emulator");
  } catch (error) {
    console.log("Functions emulator connection failed or already connected");
  }
}

export interface RequestOtpResponse {
  success: boolean;
  sessionId: string;
  message: string;
  expiresIn?: string;
}

export interface VerifyOtpResponse {
  success: boolean;
  message: string;
  passwordResetWindow?: string;
}

export interface SetNewPasswordResponse {
  success: boolean;
  message: string;
}

/**
 * Request OTP for password reset
 */
export async function requestOtp(email: string): Promise<RequestOtpResponse> {
  try {
    console.log(`Requesting OTP for email: ${email}`);
    console.log(`Using functions region: asia-southeast1`);
    
    const requestOtpFunction = httpsCallable<{email: string}, RequestOtpResponse>(
      functions, 
      "requestOtp"
    );
    
    const result = await requestOtpFunction({ email });
    console.log("OTP request successful:", result.data);
    
    return result.data;
  } catch (error: any) {
    console.error("Error requesting OTP:", error);
    console.error("Error code:", error.code);
    console.error("Error message:", error.message);
    
    throw mapFirebaseError(error);
  }
}

/**
 * Verify OTP code
 */
export async function verifyOtp(
  sessionId: string,
  code: string
): Promise<VerifyOtpResponse> {
  try {
    console.log(`Verifying OTP with sessionId: ${sessionId.substring(0, 8)}...`);
    
    const verifyOtpFunction = httpsCallable<{sessionId: string, code: string}, VerifyOtpResponse>(
      functions, 
      "verifyOtp"
    );
    
    const result = await verifyOtpFunction({ sessionId, code });
    console.log("OTP verification successful");
    
    return result.data;
  } catch (error: any) {
    console.error("Error verifying OTP:", error);
    throw mapFirebaseError(error);
  }
}

/**
 * Set new password after OTP verification
 */
export async function setNewPassword(
  sessionId: string,
  newPassword: string
): Promise<SetNewPasswordResponse> {
  try {
    console.log(`Setting new password with sessionId: ${sessionId.substring(0, 8)}...`);
    
    const setNewPasswordFunction = httpsCallable<{sessionId: string, newPassword: string}, SetNewPasswordResponse>(
      functions, 
      "setNewPassword"
    );
    
    const result = await setNewPasswordFunction({ sessionId, newPassword });
    console.log("Password reset successful");
    
    return result.data;
  } catch (error: any) {
    console.error("Error setting new password:", error);
    throw mapFirebaseError(error);
  }
}

/**
 * Map Firebase errors to user-friendly messages
 */
function mapFirebaseError(error: any): Error {
  console.log("Mapping error:", error.code, error.message);
  
  // Handle function not found errors
  if (error?.code === "functions/not-found") {
    return new Error("Service temporarily unavailable. Please ensure you have the latest app version and try again.");
  }
  
  if (error?.code === "functions/invalid-argument") {
    return new Error(error.message || "Invalid input provided");
  }
  
  if (error?.code === "functions/permission-denied") {
    return new Error("Permission denied. Please sign in and try again.");
  }
  
  if (error?.code === "functions/failed-precondition") {
    return new Error(error.message || "Request failed. Please try again.");
  }
  
  if (error?.code === "functions/unavailable") {
    return new Error("Service temporarily unavailable. Please try again in a few moments.");
  }
  
  if (error?.code === "functions/deadline-exceeded") {
    return new Error("Request timeout. Please check your connection and try again.");
  }
  
  if (error?.code === "functions/internal") {
    return new Error("Internal server error. Please try again later.");
  }
  
  if (error?.code === "functions/unauthenticated") {
    return new Error("Authentication required. Please sign in and try again.");
  }
  
  // Network errors
  if (error?.code === "network-request-failed" || error?.code === "unavailable") {
    return new Error("Network error. Please check your internet connection and try again.");
  }
  
  // Rate limiting errors (these come from our enhanced functions)
  if (error?.message?.includes("Rate limit")) {
    return new Error(error.message);
  }
  
  if (error?.message?.includes("Hourly limit")) {
    return new Error(error.message);
  }
  
  // Default error
  return new Error(error?.message || "An unexpected error occurred. Please try again.");
}

/**
 * Validation functions (unchanged)
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

export function isValidOtpCode(code: string): boolean {
  return /^\d{6}$/.test(code.trim());
}

export function validatePassword(
  password: string
): { isValid: boolean; message?: string } {
  if (!password || password.length < 8) {
    return { isValid: false, message: "Password must be at least 8 characters long" };
  }
  if (password.length > 128) {
    return { isValid: false, message: "Password must be less than 128 characters" };
  }
  const hasNumber = /\d/.test(password);
  const hasLetter = /[a-zA-Z]/.test(password);
  if (!hasNumber || !hasLetter) {
    return {
      isValid: false,
      message: "Password must contain at least one letter and one number",
    };
  }
  return { isValid: true };
}

export function getPasswordStrength(password: string): number {
  let score = 0;
  if (!password) return score;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  return Math.min(score, 4);
}

export function getPasswordStrengthLabel(strength: number): string {
  switch (strength) {
    case 0:
    case 1:
      return "Weak";
    case 2:
      return "Fair";
    case 3:
      return "Good";
    case 4:
      return "Strong";
    default:
      return "Unknown";
  }
}

export function getPasswordStrengthColor(strength: number): string {
  switch (strength) {
    case 0:
    case 1:
      return "#dc3545"; // red
    case 2:
      return "#ffc107"; // yellow
    case 3:
      return "#17a2b8"; // blue
    case 4:
      return "#28a745"; // green
    default:
      return "#6c757d"; // gray
  }
}

/**
 * Test function connectivity
 */
export async function testFunctionConnectivity(): Promise<boolean> {
  try {
    // Try to call a simple function to test connectivity
    const testFunction = httpsCallable(functions, "validateRegionConfiguration");
    await testFunction({});
    return true;
  } catch (error) {
    console.error("Function connectivity test failed:", error);
    return false;
  }
}