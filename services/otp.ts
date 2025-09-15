// services/otp.ts
import * as Crypto from "expo-crypto";
import { addDoc, collection, doc, getDoc, getFirestore, serverTimestamp, Timestamp, updateDoc } from 'firebase/firestore';
import { app } from './firebase';

export const db = getFirestore(app);

const OTP_EXP_MINUTES = 5;
const MAX_ATTEMPTS = 5;

function generateSixDigit(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sha256(text: string) {
  return await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    text
  );
}

/**
 * DEMO: Request an OTP.
 * Returns { docId, sessionId, code } so you can show code in-app.
 */
export async function requestOtpForEmail(email: string) {
  const code = generateSixDigit();
  const codeHash = await sha256(code);
  const sessionId =
    Math.random().toString(36).slice(2) + Date.now().toString(36);
  const expiresAt = Timestamp.fromDate(
    new Date(Date.now() + OTP_EXP_MINUTES * 60 * 1000)
  );

  const ref = await addDoc(collection(db, "otp"), {
    email,
    codeHash,
    createdAt: serverTimestamp(),
    expiresAt,
    attempts: 0,
    used: false,
    sessionId,
  });

  // DEMO ONLY: return the code so you can display it
  return { docId: ref.id, sessionId, code };
}

/**
 * DEMO: Verify OTP with docId + code.
 */
export async function verifyOtp({
  docId,
  code,
}: {
  docId: string;
  code: string;
}) {
  const snap = await getDoc(doc(db, "otp", docId));
  if (!snap.exists()) throw new Error("OTP not found.");

  const data = snap.data() as any;
  if (data.used) throw new Error("OTP already used.");
  if (data.attempts >= MAX_ATTEMPTS) throw new Error("Too many attempts.");
  if (data.expiresAt.toDate() < new Date())
    throw new Error("OTP expired.");

  const inputHash = await sha256(code);
  if (inputHash !== data.codeHash) {
    await updateDoc(doc(db, "otp", docId), {
      attempts: (data.attempts || 0) + 1,
    });
    throw new Error("Incorrect code.");
  }

  // Success → mark used
  await updateDoc(doc(db, "otp", docId), { used: true });
  return true;
}
