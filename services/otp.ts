// services/otp.ts - Complete OTP Service for Reset Password Flow
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "./firebase";

// Initialize Firebase Functions
const functions = getFunctions(app, "asia-southeast1"); // Match your Cloud Function region

// OTP Service Types
export interface OtpRequestResponse {
  success: boolean;
  sessionId?: string;
  message?: string;
  expiresIn?: string;
}

export interface OtpVerifyResponse {
  success: boolean;
  message?: string;
  passwordResetWindow?: string;
}

export interface SetPasswordResponse {
  success: boolean;
  message?: string;
}

/**
 * Email validation function
 */
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return emailRegex.test(email) && email.length <= 254;
};

/**
 * OTP code validation function
 */
export const isValidOtpCode = (code: string): boolean => {
  return /^\d{6}$/.test(code);
};

/**
 * Request OTP for password reset
 * Calls the Cloud Function: requestOtp
 */
export const requestOtp = async (email: string): Promise<OtpRequestResponse> => {
  try {
    if (!email || typeof email !== "string") {
      throw new Error("Valid email address is required");
    }

    if (!isValidEmail(email.trim())) {
      throw new Error("Please enter a valid email address");
    }

    console.log("Requesting OTP for email:", email);

    const requestOtpFunction = httpsCallable<{ email: string }, OtpRequestResponse>(
      functions,
      "requestOtp"
    );

    const result = await requestOtpFunction({ email: email.trim().toLowerCase() });
    
    console.log("OTP request result:", result.data);

    if (!result.data.success) {
      throw new Error(result.data.message || "Failed to request OTP");
    }

    return result.data;
  } catch (error: any) {
    console.error("Error requesting OTP:", error);
    
    // Handle Firebase Function errors
    if (error.code === 'functions/unauthenticated') {
      throw new Error("Authentication error. Please try again.");
    } else if (error.code === 'functions/permission-denied') {
      throw new Error("Permission denied. Please try again.");
    } else if (error.code === 'functions/unavailable') {
      throw new Error("Service temporarily unavailable. Please try again later.");
    } else if (error.code === 'functions/deadline-exceeded') {
      throw new Error("Request timeout. Please check your connection and try again.");
    }
    
    // Return user-friendly error message
    throw new Error(error.message || "Failed to send verification code. Please try again.");
  }
};

/**
 * Verify OTP code
 * Calls the Cloud Function: verifyOtp
 */
export const verifyOtp = async (sessionId: string, code: string): Promise<OtpVerifyResponse> => {
  try {
    if (!sessionId || typeof sessionId !== "string") {
      throw new Error("Session ID is required");
    }

    if (!code || typeof code !== "string") {
      throw new Error("Verification code is required");
    }

    if (!isValidOtpCode(code.trim())) {
      throw new Error("Please enter a valid 6-digit verification code");
    }

    console.log("Verifying OTP with sessionId:", sessionId.substring(0, 8) + "...");

    const verifyOtpFunction = httpsCallable<
      { sessionId: string; code: string },
      OtpVerifyResponse
    >(functions, "verifyOtp");

    const result = await verifyOtpFunction({
      sessionId,
      code: code.trim(),
    });

    console.log("OTP verification result:", result.data);

    if (!result.data.success) {
      throw new Error(result.data.message || "Invalid verification code");
    }

    return result.data;
  } catch (error: any) {
    console.error("Error verifying OTP:", error);
    
    // Handle Firebase Function errors
    if (error.code === 'functions/unauthenticated') {
      throw new Error("Authentication error. Please try again.");
    } else if (error.code === 'functions/permission-denied') {
      throw new Error("Permission denied. Please try again.");
    } else if (error.code === 'functions/unavailable') {
      throw new Error("Service temporarily unavailable. Please try again later.");
    } else if (error.code === 'functions/deadline-exceeded') {
      throw new Error("Request timeout. Please check your connection and try again.");
    }
    
    // Return specific error message or fallback
    throw new Error(error.message || "Failed to verify code. Please try again.");
  }
};

/**
 * Set new password after OTP verification
 * Calls the Cloud Function: setNewPassword
 */
export const setNewPassword = async (sessionId: string, newPassword: string): Promise<SetPasswordResponse> => {
  try {
    if (!sessionId || typeof sessionId !== "string") {
      throw new Error("Session ID is required");
    }

    if (!newPassword || typeof newPassword !== "string") {
      throw new Error("New password is required");
    }

    if (newPassword.length < 6) {
      throw new Error("Password must be at least 6 characters long");
    }

    console.log("Setting new password with sessionId:", sessionId.substring(0, 8) + "...");

    const setNewPasswordFunction = httpsCallable<
      { sessionId: string; newPassword: string },
      SetPasswordResponse
    >(functions, "setNewPassword");

    const result = await setNewPasswordFunction({
      sessionId,
      newPassword,
    });

    console.log("Set password result:", result.data);

    if (!result.data.success) {
      throw new Error(result.data.message || "Failed to update password");
    }

    return result.data;
  } catch (error: any) {
    console.error("Error setting new password:", error);
    
    // Handle Firebase Function errors
    if (error.code === 'functions/unauthenticated') {
      throw new Error("Authentication error. Please try again.");
    } else if (error.code === 'functions/permission-denied') {
      throw new Error("Permission denied. Please try again.");
    } else if (error.code === 'functions/unavailable') {
      throw new Error("Service temporarily unavailable. Please try again later.");
    } else if (error.code === 'functions/deadline-exceeded') {
      throw new Error("Request timeout. Please check your connection and try again.");
    }
    
    // Return specific error message or fallback
    throw new Error(error.message || "Failed to update password. Please try again.");
  }
};

/**
 * Helper function to handle common OTP flow errors
 */
export const handleOtpError = (error: any): string => {
  if (error.message?.includes("Rate limit")) {
    return error.message;
  }
  if (error.message?.includes("Invalid email")) {
    return "Please enter a valid email address";
  }
  if (error.message?.includes("expired")) {
    return "Verification code has expired. Please request a new one.";
  }
  if (error.message?.includes("Maximum attempts")) {
    return "Too many attempts. Please request a new verification code.";
  }
  if (error.message?.includes("already used")) {
    return "This verification code has already been used. Please request a new one.";
  }
  
  return error.message || "An unexpected error occurred. Please try again.";
};

/**
 * Development helper to check if OTP functions are available
 */
export const checkOtpServiceHealth = async (): Promise<boolean> => {
  try {
    // This is a simple connectivity test
    // In production, you might want to create a dedicated health check function
    const testFunction = httpsCallable(functions, "requestOtp");
    
    // Try with an obviously invalid email to test connectivity without triggering rate limits
    await testFunction({ email: "test@connectivity.check" });
    
    return true;
  } catch (error: any) {
    console.warn("OTP service health check failed:", error);
    
    // If we get a validation error, that means the function is reachable
    if (error.message?.includes("Invalid email") || error.message?.includes("Rate limit")) {
      return true;
    }
    
    return false;
  }
};