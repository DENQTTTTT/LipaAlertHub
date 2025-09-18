// services/otp.ts - Client-side OTP service for Firebase Functions
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "./firebase";

const functions = getFunctions(app);

export interface RequestOtpResponse {
  success: boolean;
  sessionId: string;
  message: string;
}

export interface VerifyOtpResponse {
  success: boolean;
  message: string;
}

export interface SetNewPasswordResponse {
  success: boolean;
  message?: string;
}

/**
 * Request OTP for password reset
 */
export async function requestOtp(email: string): Promise<RequestOtpResponse> {
  try {
    const requestOtpFunction = httpsCallable(functions, "requestOtp");
    const result = await requestOtpFunction({ email });
    return result.data as RequestOtpResponse;
  } catch (error: any) {
    console.error("Error requesting OTP:", error);
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
    const verifyOtpFunction = httpsCallable(functions, "verifyOtp");
    const result = await verifyOtpFunction({ sessionId, code });
    return result.data as VerifyOtpResponse;
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
    const setNewPasswordFunction = httpsCallable(functions, "setNewPassword");
    const result = await setNewPasswordFunction({ sessionId, newPassword });
    return result.data as SetNewPasswordResponse;
  } catch (error: any) {
    console.error("Error setting new password:", error);
    return { success: false, message: error.message };
  }
}

/**
 * Map Firebase errors to user-friendly messages
 */
function mapFirebaseError(error: any): Error {
  if (error?.code === "functions/invalid-argument") {
    return new Error(error.message || "Invalid input provided");
  }
  if (error?.code === "functions/permission-denied") {
    return new Error("Permission denied");
  }
  if (error?.code === "functions/failed-precondition") {
    return new Error(error.message || "Request failed precondition");
  }
  if (error?.code === "functions/unavailable") {
    return new Error("Service temporarily unavailable. Please try again.");
  }
  if (error?.code === "functions/deadline-exceeded") {
    return new Error("Request timeout. Please try again.");
  }
  if (error?.code === "functions/internal") {
    return new Error("Internal server error. Please try again later.");
  }
  if (error?.code === "network-request-failed") {
    return new Error("Network error. Please check your connection.");
  }
  return new Error(error?.message || "An unexpected error occurred.");
}

/**
 * Validators
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
