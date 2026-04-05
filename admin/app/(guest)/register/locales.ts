/**
 * Register Page Locales
 * ═════════════════════
 *
 * All user-facing strings on the registration page. Same structure
 * as login locales — independent of tenant translation system.
 */

import type { LoginLocale } from "../login/locales";

export type RegisterLocale = LoginLocale;

interface RegisterStrings {
  // Email step
  emailTitle: string;
  emailSubtitle: string;
  emailLabel: string;
  emailSubmit: string;
  emailSubmitting: string;

  // OTP step
  otpTitle: string;
  otpSubtitle: (email: string) => string;
  otpLabel: string;
  otpSubmit: string;
  otpSubmitting: string;
  otpBack: string;

  // Navigation
  hasAccount: string;
  hasAccountLink: string;

  // Errors
  errorRateLimit: string;
  errorGeneric: string;
  errorWrongCode: string;
  errorInvalidCode: string;

  // Footer
  privacyPolicy: string;
}

export const REGISTER_STRINGS: Record<RegisterLocale, RegisterStrings> = {
  sv: {
    emailTitle: "Skapa konto",
    emailSubtitle: "Ange din e-postadress för att skapa ett konto.",
    emailLabel: "E-postadress",
    emailSubmit: "Fortsätt",
    emailSubmitting: "Skickar...",

    otpTitle: "Verifiera din e-post",
    otpSubtitle: (email) => `Vi har skickat en kod till ${email}`,
    otpLabel: "Verifieringskod",
    otpSubmit: "Verifiera",
    otpSubmitting: "Verifierar...",
    otpBack: "Byt e-postadress",

    hasAccount: "Har du redan ett konto?",
    hasAccountLink: "Logga in",

    errorRateLimit: "För många försök. Vänta en stund och försök igen.",
    errorGeneric: "Något gick fel. Försök igen.",
    errorWrongCode: "Fel kod. Kontrollera och försök igen.",
    errorInvalidCode: "Ogiltig kod.",

    privacyPolicy: "Integritetspolicy",
  },

  en: {
    emailTitle: "Create account",
    emailSubtitle: "Enter your email address to create an account.",
    emailLabel: "Email address",
    emailSubmit: "Continue",
    emailSubmitting: "Sending...",

    otpTitle: "Verify your email",
    otpSubtitle: (email) => `We sent a code to ${email}`,
    otpLabel: "Verification code",
    otpSubmit: "Verify",
    otpSubmitting: "Verifying...",
    otpBack: "Change email address",

    hasAccount: "Already have an account?",
    hasAccountLink: "Log in",

    errorRateLimit: "Too many attempts. Please wait a moment and try again.",
    errorGeneric: "Something went wrong. Please try again.",
    errorWrongCode: "Wrong code. Please check and try again.",
    errorInvalidCode: "Invalid code.",

    privacyPolicy: "Privacy policy",
  },

  de: {
    emailTitle: "Konto erstellen",
    emailSubtitle: "Geben Sie Ihre E-Mail-Adresse ein, um ein Konto zu erstellen.",
    emailLabel: "E-Mail-Adresse",
    emailSubmit: "Weiter",
    emailSubmitting: "Wird gesendet...",

    otpTitle: "E-Mail bestätigen",
    otpSubtitle: (email) => `Wir haben einen Code an ${email} gesendet`,
    otpLabel: "Bestätigungscode",
    otpSubmit: "Bestätigen",
    otpSubmitting: "Wird überprüft...",
    otpBack: "E-Mail-Adresse ändern",

    hasAccount: "Haben Sie bereits ein Konto?",
    hasAccountLink: "Anmelden",

    errorRateLimit: "Zu viele Versuche. Bitte warten Sie einen Moment und versuchen Sie es erneut.",
    errorGeneric: "Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.",
    errorWrongCode: "Falscher Code. Bitte überprüfen und erneut versuchen.",
    errorInvalidCode: "Ungültiger Code.",

    privacyPolicy: "Datenschutzrichtlinie",
  },

  fr: {
    emailTitle: "Créer un compte",
    emailSubtitle: "Entrez votre adresse e-mail pour créer un compte.",
    emailLabel: "Adresse e-mail",
    emailSubmit: "Continuer",
    emailSubmitting: "Envoi en cours...",

    otpTitle: "Vérifiez votre e-mail",
    otpSubtitle: (email) => `Nous avons envoyé un code à ${email}`,
    otpLabel: "Code de vérification",
    otpSubmit: "Vérifier",
    otpSubmitting: "Vérification...",
    otpBack: "Changer d'adresse e-mail",

    hasAccount: "Vous avez déjà un compte ?",
    hasAccountLink: "Se connecter",

    errorRateLimit: "Trop de tentatives. Veuillez patienter un moment et réessayer.",
    errorGeneric: "Une erreur s'est produite. Veuillez réessayer.",
    errorWrongCode: "Code incorrect. Veuillez vérifier et réessayer.",
    errorInvalidCode: "Code invalide.",

    privacyPolicy: "Politique de confidentialité",
  },

  es: {
    emailTitle: "Crear cuenta",
    emailSubtitle: "Ingresa tu correo electrónico para crear una cuenta.",
    emailLabel: "Correo electrónico",
    emailSubmit: "Continuar",
    emailSubmitting: "Enviando...",

    otpTitle: "Verifica tu correo",
    otpSubtitle: (email) => `Hemos enviado un código a ${email}`,
    otpLabel: "Código de verificación",
    otpSubmit: "Verificar",
    otpSubmitting: "Verificando...",
    otpBack: "Cambiar correo electrónico",

    hasAccount: "¿Ya tienes una cuenta?",
    hasAccountLink: "Iniciar sesión",

    errorRateLimit: "Demasiados intentos. Espera un momento e inténtalo de nuevo.",
    errorGeneric: "Algo salió mal. Inténtalo de nuevo.",
    errorWrongCode: "Código incorrecto. Verifica e inténtalo de nuevo.",
    errorInvalidCode: "Código inválido.",

    privacyPolicy: "Política de privacidad",
  },
};
