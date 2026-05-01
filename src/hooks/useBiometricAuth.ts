import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { NativeBiometric, BiometryType } from "capacitor-native-biometric";

const BIOMETRIC_KEY = "biometric_enabled";
const CREDENTIALS_SERVER = "graceflare.app"; // arbitrary key used by the native keychain

export function useBiometricAuth() {
  const [checking, setChecking] = useState(false);

  const isEnabled = () => localStorage.getItem(BIOMETRIC_KEY) === "true";

  /**
   * Check whether biometrics are available on this device.
   * Returns false on web (biometrics are iOS-only in this app).
   */
  const isAvailable = async (): Promise<boolean> => {
    if (!Capacitor.isNativePlatform()) return false;
    try {
      const result = await NativeBiometric.isAvailable();
      return result.isAvailable && result.biometryType !== BiometryType.NONE;
    } catch {
      return false;
    }
  };

  /**
   * After a successful email/password login, offer to save credentials
   * in the native keychain so future logins can use Face ID / Touch ID.
   */
  const saveCredentials = async (email: string, password: string) => {
    if (!Capacitor.isNativePlatform()) return;
    try {
      await NativeBiometric.setCredentials({
        username: email,
        password,
        server: CREDENTIALS_SERVER,
      });
      localStorage.setItem(BIOMETRIC_KEY, "true");
    } catch {
      // Non-fatal — user just won't get biometric prompt next time
    }
  };

  /**
   * Prompt biometric verification and return stored credentials on success.
   * Returns null if unavailable, not enabled, or the user cancels.
   */
  const getCredentials = async (): Promise<{ email: string; password: string } | null> => {
    if (!Capacitor.isNativePlatform() || !isEnabled()) return null;
    setChecking(true);
    try {
      await NativeBiometric.verifyIdentity({
        reason: "Sign in to Grace Flare",
        title: "Grace Flare",
        subtitle: "Use Face ID or Touch ID",
        negativeButtonText: "Use password",
      });
      const credentials = await NativeBiometric.getCredentials({
        server: CREDENTIALS_SERVER,
      });
      return { email: credentials.username, password: credentials.password };
    } catch {
      // User cancelled or biometric failed
      return null;
    } finally {
      setChecking(false);
    }
  };

  /**
   * Remove saved credentials and disable biometric login.
   */
  const disable = async () => {
    if (!Capacitor.isNativePlatform()) return;
    try {
      await NativeBiometric.deleteCredentials({ server: CREDENTIALS_SERVER });
    } catch {
      // Already removed
    }
    localStorage.removeItem(BIOMETRIC_KEY);
  };

  return { isAvailable, isEnabled, saveCredentials, getCredentials, disable, checking };
}
