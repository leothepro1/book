/**
 * Login Page Locales
 * ══════════════════
 *
 * All user-facing strings on the login page, translated to every
 * supported language. Independent of the tenant's translation system —
 * login page language is chosen by the guest, not the tenant.
 *
 * To add a new language: add the code to LOGIN_LANGUAGES and a
 * corresponding entry to LOGIN_STRINGS. That's it.
 */

export const LOGIN_LANGUAGES = [
  { code: "sv", nativeName: "Svenska" },
  { code: "en", nativeName: "English" },
  { code: "de", nativeName: "Deutsch" },
  { code: "fr", nativeName: "Français" },
  { code: "es", nativeName: "Español" },
] as const;

export type LoginLocale = (typeof LOGIN_LANGUAGES)[number]["code"];

interface LoginStrings {
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
  noAccount: string;
  noAccountLink: string;

  // Errors
  errorRateLimit: string;
  errorGeneric: string;
  errorWrongCode: string;
  errorInvalidCode: string;

  // Footer
  privacyPolicy: string;
}

export const LOGIN_STRINGS: Record<LoginLocale, LoginStrings> = {
  sv: {
    emailTitle: "Logga in",
    emailSubtitle: "Välkommen tillbaka! Logga in för att fortsätta.",
    emailLabel: "E-postadress",
    emailSubmit: "Fortsätt",
    emailSubmitting: "Skickar...",

    otpTitle: "Ange kod",
    otpSubtitle: (email) => `Vi har skickat en kod till ${email}`,
    otpLabel: "Verifieringskod",
    otpSubmit: "Logga in",
    otpSubmitting: "Verifierar...",
    otpBack: "Byt e-postadress",

    noAccount: "Inget konto?",
    noAccountLink: "Skapa ett",

    errorRateLimit: "För många försök. Vänta en stund och försök igen.",
    errorGeneric: "Något gick fel. Försök igen.",
    errorWrongCode: "Fel kod. Kontrollera och försök igen.",
    errorInvalidCode: "Ogiltig kod.",

    privacyPolicy: "Integritetspolicy",
  },

  en: {
    emailTitle: "Log in",
    emailSubtitle: "Welcome back! Please sign in to continue.",
    emailLabel: "Email address",
    emailSubmit: "Continue",
    emailSubmitting: "Sending...",

    otpTitle: "Enter code",
    otpSubtitle: (email) => `We sent a code to ${email}`,
    otpLabel: "Verification code",
    otpSubmit: "Log in",
    otpSubmitting: "Verifying...",
    otpBack: "Change email address",

    noAccount: "Don't have an account?",
    noAccountLink: "Create one",

    errorRateLimit: "Too many attempts. Please wait a moment and try again.",
    errorGeneric: "Something went wrong. Please try again.",
    errorWrongCode: "Wrong code. Please check and try again.",
    errorInvalidCode: "Invalid code.",

    privacyPolicy: "Privacy policy",
  },

  de: {
    emailTitle: "Anmelden",
    emailSubtitle: "Willkommen zurück! Bitte melden Sie sich an, um fortzufahren.",
    emailLabel: "E-Mail-Adresse",
    emailSubmit: "Weiter",
    emailSubmitting: "Wird gesendet...",

    otpTitle: "Code eingeben",
    otpSubtitle: (email) => `Wir haben einen Code an ${email} gesendet`,
    otpLabel: "Bestätigungscode",
    otpSubmit: "Anmelden",
    otpSubmitting: "Wird überprüft...",
    otpBack: "E-Mail-Adresse ändern",

    noAccount: "Kein Konto?",
    noAccountLink: "Erstellen Sie eines",

    errorRateLimit: "Zu viele Versuche. Bitte warten Sie einen Moment und versuchen Sie es erneut.",
    errorGeneric: "Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.",
    errorWrongCode: "Falscher Code. Bitte überprüfen und erneut versuchen.",
    errorInvalidCode: "Ungültiger Code.",

    privacyPolicy: "Datenschutzrichtlinie",
  },

  fr: {
    emailTitle: "Se connecter",
    emailSubtitle: "Bon retour ! Veuillez vous connecter pour continuer.",
    emailLabel: "Adresse e-mail",
    emailSubmit: "Continuer",
    emailSubmitting: "Envoi en cours...",

    otpTitle: "Entrez le code",
    otpSubtitle: (email) => `Nous avons envoyé un code à ${email}`,
    otpLabel: "Code de vérification",
    otpSubmit: "Se connecter",
    otpSubmitting: "Vérification...",
    otpBack: "Changer d'adresse e-mail",

    noAccount: "Pas de compte ?",
    noAccountLink: "Créer un",

    errorRateLimit: "Trop de tentatives. Veuillez patienter un moment et réessayer.",
    errorGeneric: "Une erreur s'est produite. Veuillez réessayer.",
    errorWrongCode: "Code incorrect. Veuillez vérifier et réessayer.",
    errorInvalidCode: "Code invalide.",

    privacyPolicy: "Politique de confidentialité",
  },

  es: {
    emailTitle: "Iniciar sesión",
    emailSubtitle: "¡Bienvenido de nuevo! Inicia sesión para continuar.",
    emailLabel: "Correo electrónico",
    emailSubmit: "Continuar",
    emailSubmitting: "Enviando...",

    otpTitle: "Ingresa el código",
    otpSubtitle: (email) => `Hemos enviado un código a ${email}`,
    otpLabel: "Código de verificación",
    otpSubmit: "Iniciar sesión",
    otpSubmitting: "Verificando...",
    otpBack: "Cambiar correo electrónico",

    noAccount: "¿No tienes cuenta?",
    noAccountLink: "Crea una",

    errorRateLimit: "Demasiados intentos. Espera un momento e inténtalo de nuevo.",
    errorGeneric: "Algo salió mal. Inténtalo de nuevo.",
    errorWrongCode: "Código incorrecto. Verifica e inténtalo de nuevo.",
    errorInvalidCode: "Código inválido.",

    privacyPolicy: "Política de privacidad",
  },
};
