-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PRE_CHECKIN', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PAID', 'FULFILLED', 'CANCELLED', 'PARTIALLY_REFUNDED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('ACCOMMODATION', 'PURCHASE');

-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('BASIC', 'GROW', 'PRO');

-- CreateEnum
CREATE TYPE "PaymentSessionStatus" AS ENUM ('INITIATED', 'PENDING', 'RESOLVED', 'REJECTED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('STRIPE_CHECKOUT', 'STRIPE_ELEMENTS', 'BEDFRONT_PAYMENTS_CHECKOUT', 'BEDFRONT_PAYMENTS_ELEMENTS', 'SWEDBANK_PAY', 'NETS', 'INVOICE');

-- CreateEnum
CREATE TYPE "GiftCardStatus" AS ENUM ('PENDING', 'ACTIVE', 'REDEEMED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderFinancialStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'VOIDED');

-- CreateEnum
CREATE TYPE "OrderFulfillmentStatus" AS ENUM ('UNFULFILLED', 'SCHEDULED', 'IN_PROGRESS', 'FULFILLED', 'ON_HOLD', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderEventType" AS ENUM ('ORDER_CREATED', 'ORDER_CONFIRMED', 'ORDER_UPDATED', 'ORDER_CANCELLED', 'ORDER_REOPENED', 'PAYMENT_AUTHORIZED', 'PAYMENT_CAPTURED', 'PAYMENT_FAILED', 'PAYMENT_VOIDED', 'REFUND_INITIATED', 'REFUND_SUCCEEDED', 'REFUND_FAILED', 'ORDER_FULFILLED', 'ORDER_UNFULFILLED', 'INVENTORY_RELEASED', 'EMAIL_SENT', 'NOTE_ADDED', 'RECONCILED', 'GUEST_INFO_UPDATED', 'CHANNEL_ORDER_RECEIVED', 'CHANNEL_ORDER_UPDATED', 'CHANNEL_ORDER_CANCELLED', 'CHANNEL_SYNC_ERROR', 'DISCOUNT_APPLIED', 'DISCOUNT_CODE_REDEEMED', 'DISCOUNT_REMOVED');

-- CreateEnum
CREATE TYPE "GuestAccountState" AS ENUM ('ENABLED', 'DISABLED', 'INVITED', 'DECLINED');

-- CreateEnum
CREATE TYPE "GuestMarketingState" AS ENUM ('SUBSCRIBED', 'UNSUBSCRIBED', 'PENDING', 'NOT_SUBSCRIBED', 'REDACTED');

-- CreateEnum
CREATE TYPE "GuestOptInLevel" AS ENUM ('SINGLE_OPT_IN', 'CONFIRMED_OPT_IN', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "GuestEventType" AS ENUM ('ACCOUNT_CREATED', 'ACCOUNT_UPDATED', 'MARKETING_SUBSCRIBED', 'MARKETING_UNSUBSCRIBED', 'COMMENT_ADDED', 'TAG_ADDED', 'TAG_REMOVED', 'ORDER_PLACED', 'ORDER_PAID', 'ORDER_FULFILLED', 'ORDER_CANCELLED', 'ORDER_REFUNDED', 'LOGIN', 'GUEST_EMAIL_SENT', 'DATA_EXPORT_REQUESTED', 'DATA_DELETION_REQUESTED', 'GUEST_JOINED_SEGMENT', 'GUEST_LEFT_SEGMENT');

-- CreateEnum
CREATE TYPE "DiscountMethod" AS ENUM ('AUTOMATIC', 'CODE');

-- CreateEnum
CREATE TYPE "DiscountValueType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

-- CreateEnum
CREATE TYPE "DiscountTargetType" AS ENUM ('ORDER', 'LINE_ITEM');

-- CreateEnum
CREATE TYPE "DiscountStatus" AS ENUM ('ACTIVE', 'SCHEDULED', 'EXPIRED', 'DISABLED');

-- CreateEnum
CREATE TYPE "DiscountConditionType" AS ENUM ('MIN_NIGHTS', 'DAYS_IN_ADVANCE', 'ARRIVAL_WINDOW', 'MIN_ORDER_AMOUNT', 'MIN_ITEMS', 'SPECIFIC_PRODUCTS', 'CUSTOMER_SEGMENT', 'ONCE_PER_CUSTOMER', 'SPECIFIC_COLLECTIONS', 'SPECIFIC_CUSTOMERS');

-- CreateEnum
CREATE TYPE "DiscountEventType" AS ENUM ('CREATED', 'UPDATED', 'ENABLED', 'DISABLED', 'CODE_ADDED', 'CODE_REMOVED', 'USAGE_RECORDED', 'USAGE_VOIDED', 'NOTE_ADDED');

-- CreateEnum
CREATE TYPE "AccommodationType" AS ENUM ('HOTEL', 'CABIN', 'CAMPING', 'APARTMENT', 'PITCH');

-- CreateEnum
CREATE TYPE "AccommodationStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AccommodationUnitStatus" AS ENUM ('AVAILABLE', 'MAINTENANCE', 'BLOCKED', 'RETIRED');

-- CreateEnum
CREATE TYPE "BedType" AS ENUM ('SINGLE', 'DOUBLE', 'QUEEN', 'KING', 'SOFA_BED', 'BUNK_BED', 'FRENCH', 'FUTON', 'TATAMI', 'FOLDABLE', 'EXTRA_BED');

-- CreateEnum
CREATE TYPE "FacilityType" AS ENUM ('AIR_CONDITIONING', 'HEATING', 'FAN', 'FIREPLACE', 'BATHTUB', 'SHOWER', 'SAUNA', 'HOT_TUB', 'HAIRDRYER', 'BATHROBES', 'SLIPPERS', 'FREE_TOILETRIES', 'BIDET', 'WC', 'KITCHEN', 'KITCHENETTE', 'REFRIGERATOR', 'FREEZER', 'MICROWAVE', 'OVEN', 'STOVE', 'DISHWASHER', 'KETTLE', 'COFFEE_MAKER', 'TOASTER', 'COOKWARE', 'MINIBAR', 'WIFI', 'FIBER', 'TV', 'FLAT_SCREEN_TV', 'CABLE_TV', 'SATELLITE_TV', 'PAY_TV', 'BLUETOOTH_SPEAKER', 'APPLE_TV', 'CHROMECAST', 'DVD_PLAYER', 'CD_PLAYER', 'GAME_CONSOLE', 'LAPTOP_STORAGE', 'WARDROBE', 'SOFA', 'SOFA_BED_LIVING', 'DESK', 'IRONING_BOARD', 'IRON', 'TROUSER_PRESS', 'WASHER', 'DRYER', 'DRYING_CABINET', 'STEAMER', 'DUMBBELL', 'BALCONY', 'TERRACE', 'PATIO', 'PRIVATE_POOL', 'GARDEN_VIEW', 'POOL_VIEW', 'SEA_VIEW', 'LAKE_VIEW', 'MOUNTAIN_VIEW', 'CITY_VIEW', 'CANAL_VIEW', 'RIVER_VIEW', 'FJORD_VIEW', 'PRIVATE_ENTRANCE', 'STORAGE_BOX', 'PETS_ALLOWED', 'PETS_NOT_ALLOWED', 'NO_SMOKING', 'SOUNDPROOFED', 'WHEELCHAIR_ACCESSIBLE', 'EV_CHARGER', 'SKI_STORAGE', 'MOTOR_HEATER', 'WAKE_UP_SERVICE', 'ALARM_CLOCK', 'LATE_CHECKOUT', 'DEPARTURE_CLEANING');

-- CreateEnum
CREATE TYPE "FacilitySource" AS ENUM ('PMS', 'MANUAL');

-- CreateEnum
CREATE TYPE "RatePlanCancellationPolicy" AS ENUM ('FLEXIBLE', 'MODERATE', 'NON_REFUNDABLE');

-- CreateEnum
CREATE TYPE "RatePlanStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "RestrictionType" AS ENUM ('MIN_STAY', 'MAX_STAY', 'CLOSED_TO_ARRIVAL', 'CLOSED_TO_DEPARTURE', 'NO_CHECK_IN', 'NO_CHECK_OUT');

-- CreateEnum
CREATE TYPE "EmailSendStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'BOUNCED', 'COMPLAINED', 'FAILED', 'PERMANENTLY_FAILED');

-- CreateEnum
CREATE TYPE "EmailEventType" AS ENUM ('BOOKING_CONFIRMED', 'BOOKING_CANCELLED', 'CHECK_IN_CONFIRMED', 'CHECK_OUT_CONFIRMED', 'MAGIC_LINK', 'SUPPORT_REPLY', 'GUEST_OTP', 'ORDER_CONFIRMED', 'GIFT_CARD_SENT', 'PAYMENT_FAILED', 'ABANDONED_CHECKOUT', 'PRE_ARRIVAL_REMINDER', 'POST_STAY_FEEDBACK', 'MARKETING_OPT_IN_CONFIRM');

-- CreateEnum
CREATE TYPE "TranslationNamespace" AS ENUM ('PLATFORM', 'TENANT', 'LOCKED');

-- CreateEnum
CREATE TYPE "EmailDomainStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('ACTIVE', 'DRAFT', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('STANDARD', 'GIFT_CARD');

-- CreateEnum
CREATE TYPE "InventoryChangeReason" AS ENUM ('PURCHASE', 'MANUAL_ADJUSTMENT', 'RETURN', 'RESERVATION', 'RESERVATION_RELEASED', 'INITIAL');

-- CreateEnum
CREATE TYPE "CheckoutSessionStatus" AS ENUM ('PENDING', 'ADDON_SELECTION', 'CHECKOUT', 'COMPLETED', 'EXPIRED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "CheckoutSessionType" AS ENUM ('ACCOMMODATION', 'CART');

-- CreateEnum
CREATE TYPE "AppStatus" AS ENUM ('PENDING_SETUP', 'ACTIVE', 'ERROR', 'PAUSED', 'UNINSTALLED');

-- CreateEnum
CREATE TYPE "AppEventType" AS ENUM ('INSTALLED', 'SETUP_STARTED', 'SETUP_COMPLETED', 'ACTIVATED', 'PAUSED', 'ERROR_OCCURRED', 'ERROR_RESOLVED', 'UNINSTALLED', 'SETTINGS_UPDATED', 'TIER_CHANGED');

-- CreateEnum
CREATE TYPE "EmailSyncStatus" AS ENUM ('SYNCED', 'PENDING', 'FAILED', 'UNSUBSCRIBED');

-- CreateEnum
CREATE TYPE "CheckoutIdempotencyStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "AnalyticsEventType" AS ENUM ('SESSION_STARTED', 'PAGE_VIEWED', 'SESSION_ENDED', 'SEARCH_PERFORMED', 'ACCOMMODATION_VIEWED', 'RATE_PLAN_SELECTED', 'PRODUCT_VIEWED', 'ADDON_VIEWED', 'ADDON_ADDED', 'ADDON_REMOVED', 'CHECKOUT_STARTED', 'CHECKOUT_COMPLETED', 'CHECKOUT_ABANDONED', 'ORDER_CREATED', 'ORDER_PAID', 'ORDER_CANCELLED', 'ORDER_REFUNDED');

-- CreateEnum
CREATE TYPE "AnalyticsMetric" AS ENUM ('REVENUE', 'SESSIONS', 'VISITORS', 'ORDERS', 'AVERAGE_ORDER_VALUE', 'RETURNING_CUSTOMER_RATE');

-- CreateEnum
CREATE TYPE "AnalyticsDimension" AS ENUM ('TOTAL', 'CHANNEL', 'CITY', 'DEVICE', 'PRODUCT');

-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('DESKTOP', 'MOBILE', 'TABLET');

-- CreateEnum
CREATE TYPE "EmailAppStatus" AS ENUM ('ACTIVE', 'PAUSED', 'UNINSTALLED');

-- CreateEnum
CREATE TYPE "EmailTemplateType" AS ENUM ('CAMPAIGN', 'AUTOMATION', 'SYSTEM');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RecipientStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SUPPRESSED');

-- CreateEnum
CREATE TYPE "AutomationTrigger" AS ENUM ('GUEST_CREATED', 'ORDER_COMPLETED', 'GUEST_INACTIVE');

-- CreateEnum
CREATE TYPE "AutomationStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "SuppressionReason" AS ENUM ('UNSUBSCRIBE', 'BOUNCE', 'COMPLAINT', 'MANUAL');

-- CreateEnum
CREATE TYPE "BounceType" AS ENUM ('HARD', 'SOFT');

-- CreateTable
CREATE TABLE "PendingBookingLock" (
    "key" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingBookingLock_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "clerkOrgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "portalSlug" TEXT,
    "ownerClerkUserId" TEXT,
    "settings" JSONB,
    "draftSettings" JSONB,
    "draftUpdatedAt" TIMESTAMP(3),
    "draftUpdatedBy" TEXT,
    "settingsVersion" INTEGER NOT NULL DEFAULT 0,
    "previousSettings" JSONB,
    "legalName" TEXT,
    "businessType" TEXT,
    "nickname" TEXT,
    "phone" TEXT,
    "addressStreet" TEXT,
    "addressPostalCode" TEXT,
    "addressCity" TEXT,
    "addressCountry" TEXT,
    "organizationNumber" TEXT,
    "vatNumber" TEXT,
    "emailFrom" TEXT,
    "emailFromName" TEXT,
    "pendingEmailFrom" TEXT,
    "emailVerificationToken" TEXT,
    "emailVerificationExpiry" TIMESTAMP(3),
    "emailVerificationSentTo" TEXT,
    "emailLogoUrl" TEXT,
    "emailLogoWidth" INTEGER,
    "emailAccentColor" TEXT,
    "orderNumberPrefix" TEXT NOT NULL DEFAULT '',
    "orderNumberSuffix" TEXT NOT NULL DEFAULT '',
    "checkinEnabled" BOOLEAN NOT NULL DEFAULT false,
    "checkoutEnabled" BOOLEAN NOT NULL DEFAULT false,
    "earlyCheckinEnabled" BOOLEAN NOT NULL DEFAULT false,
    "earlyCheckinDays" INTEGER NOT NULL DEFAULT 0,
    "screenshotDesktopUrl" TEXT,
    "screenshotMobileUrl" TEXT,
    "screenshotHash" TEXT,
    "screenshotUpdatedAt" TIMESTAMP(3),
    "screenshotPending" BOOLEAN NOT NULL DEFAULT false,
    "stripeAccountId" TEXT,
    "stripeOnboardingComplete" BOOLEAN NOT NULL DEFAULT false,
    "stripeLivemode" BOOLEAN NOT NULL DEFAULT false,
    "stripeConnectedAt" TIMESTAMP(3),
    "paymentMethodConfig" JSONB,
    "subscriptionPlan" "SubscriptionPlan" NOT NULL DEFAULT 'BASIC',
    "platformFeeBps" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "discountsEnabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantPolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessEntity" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "businessType" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "nickname" TEXT,
    "addressStreet" TEXT,
    "addressApartment" TEXT,
    "addressPostalCode" TEXT,
    "addressCity" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "externalId" TEXT,
    "externalSource" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "guestEmail" TEXT NOT NULL,
    "phone" TEXT,
    "street" TEXT,
    "postalCode" TEXT,
    "city" TEXT,
    "country" TEXT,
    "arrival" TIMESTAMP(3) NOT NULL,
    "departure" TIMESTAMP(3) NOT NULL,
    "unit" TEXT NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'PRE_CHECKIN',
    "checkedInAt" TIMESTAMP(3),
    "checkedOutAt" TIMESTAMP(3),
    "signatureCapturedAt" TIMESTAMP(3),
    "signatureDataUrl" TEXT,
    "checkinData" JSONB,
    "portalToken" TEXT,
    "confirmedEmailSentAt" TIMESTAMP(3),
    "checkedInEmailSentAt" TIMESTAMP(3),
    "checkedOutEmailSentAt" TIMESTAMP(3),
    "guestAccountId" TEXT,
    "accommodationId" TEXT,
    "orderId" TEXT,
    "ratePlanId" TEXT,
    "checkIn" TIMESTAMP(3),
    "checkOut" TIMESTAMP(3),
    "guestCount" INTEGER,
    "specialRequests" TEXT,
    "pmsBookingRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MagicLink" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MagicLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantIntegration" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "credentialsEncrypted" BYTEA NOT NULL,
    "credentialsIv" BYTEA NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "lastSyncAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastError" TEXT,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "externalTenantId" TEXT,
    "isDemoEnvironment" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "bookingExternalId" TEXT,
    "payload" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "tokens" DOUBLE PRECISION NOT NULL DEFAULT 200,
    "lastRefill" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingSyncError" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "error" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "lastAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingSyncError_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDedup" (
    "id" TEXT NOT NULL,
    "dedupKey" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDedup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL DEFAULT 'image',
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "format" TEXT NOT NULL,
    "folder" TEXT NOT NULL DEFAULT 'general',
    "alt" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL DEFAULT '',
    "uploadedBy" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantLocale" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "primary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantLocale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantTranslation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "namespace" "TranslationNamespace" NOT NULL,
    "value" TEXT NOT NULL,
    "draftValue" TEXT,
    "sourceDigest" TEXT NOT NULL,
    "draftSourceDigest" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventType" "EmailEventType" NOT NULL,
    "subject" TEXT,
    "previewText" TEXT,
    "html" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailSendLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventType" "EmailEventType" NOT NULL,
    "toEmail" TEXT NOT NULL,
    "resendId" TEXT,
    "status" "EmailSendStatus" NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "nextRetryAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "variables" JSONB,
    "orderId" TEXT,
    "bookingId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailSendLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailUnsubscribe" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "unsubscribedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailUnsubscribe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailDomain" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "resendDomainId" TEXT,
    "status" "EmailDomainStatus" NOT NULL DEFAULT 'PENDING',
    "dnsRecords" JSONB,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MagicLinkToken" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MagicLinkToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailRateLimit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "eventType" "EmailEventType" NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailRateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "address1" TEXT,
    "address2" TEXT,
    "city" TEXT,
    "postalCode" TEXT,
    "country" TEXT DEFAULT 'SE',
    "locale" TEXT,
    "verifiedEmail" BOOLEAN NOT NULL DEFAULT false,
    "state" "GuestAccountState" NOT NULL DEFAULT 'ENABLED',
    "note" TEXT,
    "emailMarketingState" "GuestMarketingState" NOT NULL DEFAULT 'NOT_SUBSCRIBED',
    "emailConsentedAt" TIMESTAMP(3),
    "emailConsentSource" TEXT,
    "emailOptInLevel" "GuestOptInLevel" NOT NULL DEFAULT 'SINGLE_OPT_IN',
    "smsMarketingState" "GuestMarketingState" NOT NULL DEFAULT 'NOT_SUBSCRIBED',
    "smsConsentedAt" TIMESTAMP(3),
    "dataSaleOptOut" BOOLEAN NOT NULL DEFAULT false,
    "dataSaleOptOutAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestOtpCode" (
    "id" TEXT NOT NULL,
    "guestAccountId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestOtpCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestTag" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "guestAccountId" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "GuestTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestNote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "guestAccountId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "GuestNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestAccountEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "guestAccountId" TEXT NOT NULL,
    "type" "GuestEventType" NOT NULL,
    "message" TEXT,
    "metadata" JSONB,
    "actorUserId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestAccountEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestAddress" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "guestAccountId" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "firstName" TEXT,
    "lastName" TEXT,
    "company" TEXT,
    "address1" TEXT NOT NULL,
    "address2" TEXT,
    "city" TEXT NOT NULL,
    "postalCode" TEXT,
    "province" TEXT,
    "country" TEXT NOT NULL DEFAULT 'SE',
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "slug" TEXT NOT NULL,
    "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "productType" "ProductType" NOT NULL DEFAULT 'STANDARD',
    "price" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'SEK',
    "compareAtPrice" INTEGER,
    "trackInventory" BOOLEAN NOT NULL DEFAULT false,
    "inventoryQuantity" INTEGER NOT NULL DEFAULT 0,
    "continueSellingWhenOutOfStock" BOOLEAN NOT NULL DEFAULT false,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "templateId" TEXT,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductMedia" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'image',
    "alt" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "filename" TEXT NOT NULL DEFAULT '',
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductOption" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "values" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "option1" TEXT,
    "option2" TEXT,
    "option3" TEXT,
    "imageUrl" TEXT,
    "price" INTEGER NOT NULL,
    "compareAtPrice" INTEGER,
    "sku" TEXT,
    "trackInventory" BOOLEAN NOT NULL DEFAULT false,
    "inventoryQuantity" INTEGER NOT NULL DEFAULT 0,
    "continueSellingWhenOutOfStock" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "suffix" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCollection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "slug" TEXT NOT NULL,
    "imageUrl" TEXT,
    "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCollectionItem" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductCollectionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Accommodation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "shortName" TEXT,
    "externalCode" TEXT,
    "externalId" TEXT,
    "pmsProvider" TEXT,
    "pmsSyncedAt" TIMESTAMP(3),
    "pmsData" JSONB,
    "accommodationType" "AccommodationType" NOT NULL,
    "status" "AccommodationStatus" NOT NULL DEFAULT 'ACTIVE',
    "nameOverride" TEXT,
    "descriptionOverride" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "maxGuests" INTEGER NOT NULL,
    "minGuests" INTEGER NOT NULL DEFAULT 1,
    "defaultGuests" INTEGER,
    "maxAdults" INTEGER,
    "minAdults" INTEGER,
    "maxChildren" INTEGER,
    "minChildren" INTEGER,
    "extraBeds" INTEGER NOT NULL DEFAULT 0,
    "roomSizeSqm" DOUBLE PRECISION,
    "bedrooms" INTEGER,
    "bathrooms" INTEGER,
    "floorNumber" INTEGER,
    "basePricePerNight" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'SEK',
    "taxRate" INTEGER NOT NULL DEFAULT 0,
    "totalUnits" INTEGER NOT NULL DEFAULT 1,
    "baseAvailability" INTEGER NOT NULL DEFAULT 1,
    "roomTypeGroupId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Accommodation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccommodationHighlight" (
    "id" TEXT NOT NULL,
    "accommodationId" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AccommodationHighlight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccommodationUnit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accommodationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "externalId" TEXT,
    "floor" INTEGER,
    "notes" TEXT,
    "status" "AccommodationUnitStatus" NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccommodationUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccommodationFacility" (
    "id" TEXT NOT NULL,
    "accommodationId" TEXT NOT NULL,
    "facilityType" "FacilityType" NOT NULL,
    "source" "FacilitySource" NOT NULL DEFAULT 'MANUAL',
    "overrideHidden" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AccommodationFacility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BedConfiguration" (
    "id" TEXT NOT NULL,
    "accommodationId" TEXT NOT NULL,
    "bedType" "BedType" NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "BedConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RatePlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accommodationId" TEXT NOT NULL,
    "externalId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "cancellationPolicy" "RatePlanCancellationPolicy" NOT NULL DEFAULT 'FLEXIBLE',
    "cancellationDescription" TEXT,
    "pricePerNight" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SEK',
    "status" "RatePlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RatePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccommodationRestriction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accommodationId" TEXT NOT NULL,
    "restrictionType" "RestrictionType" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "value" INTEGER,
    "source" "FacilitySource" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccommodationRestriction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccommodationMedia" (
    "id" TEXT NOT NULL,
    "accommodationId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "altText" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "source" "FacilitySource" NOT NULL DEFAULT 'MANUAL',

    CONSTRAINT "AccommodationMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccommodationCategory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "slug" TEXT NOT NULL,
    "imageUrl" TEXT,
    "status" "AccommodationStatus" NOT NULL DEFAULT 'ACTIVE',
    "visibleInSearch" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "pmsRef" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccommodationCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccommodationCategoryItem" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "accommodationId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccommodationCategoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccommodationCategoryAddon" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccommodationCategoryAddon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckoutSession" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" "CheckoutSessionStatus" NOT NULL DEFAULT 'PENDING',
    "sessionType" "CheckoutSessionType" NOT NULL DEFAULT 'ACCOMMODATION',
    "accommodationId" TEXT,
    "ratePlanId" TEXT,
    "checkIn" TIMESTAMP(3),
    "checkOut" TIMESTAMP(3),
    "adults" INTEGER,
    "accommodationName" TEXT,
    "accommodationSlug" TEXT,
    "ratePlanName" TEXT,
    "ratePlanDescription" TEXT NOT NULL DEFAULT '',
    "ratePlanCancellationPolicy" TEXT,
    "pricePerNight" INTEGER,
    "totalNights" INTEGER,
    "accommodationTotal" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'SEK',
    "cartItems" JSONB,
    "cartTotal" INTEGER,
    "selectedAddons" JSONB NOT NULL DEFAULT '[]',
    "guestEmail" TEXT,
    "guestFirstName" TEXT,
    "guestLastName" TEXT,
    "guestPhone" TEXT,
    "dedupKey" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheckoutSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductTag" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductTagItem" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductTagItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryChange" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "quantityDelta" INTEGER NOT NULL,
    "quantityAfter" INTEGER NOT NULL,
    "reason" "InventoryChangeReason" NOT NULL,
    "note" TEXT,
    "actorUserId" TEXT,
    "referenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceChange" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "previousPrice" INTEGER NOT NULL,
    "newPrice" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryReservation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "quantity" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sessionId" TEXT NOT NULL,
    "consumed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderNumber" INTEGER NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "financialStatus" "OrderFinancialStatus" NOT NULL DEFAULT 'PENDING',
    "fulfillmentStatus" "OrderFulfillmentStatus" NOT NULL DEFAULT 'UNFULFILLED',
    "orderType" "OrderType" NOT NULL DEFAULT 'ACCOMMODATION',
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'STRIPE_CHECKOUT',
    "guestEmail" TEXT NOT NULL DEFAULT '',
    "guestName" TEXT NOT NULL DEFAULT '',
    "guestPhone" TEXT,
    "billingAddress" JSONB,
    "guestAccountId" TEXT,
    "subtotalAmount" INTEGER NOT NULL,
    "taxAmount" INTEGER NOT NULL DEFAULT 0,
    "taxRate" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SEK',
    "discountAmount" INTEGER NOT NULL DEFAULT 0,
    "discountCode" TEXT,
    "stripeCheckoutSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "platformFeeBps" INTEGER,
    "statusToken" TEXT,
    "tags" TEXT NOT NULL DEFAULT '',
    "customerNote" TEXT,
    "metadata" JSONB,
    "sourceChannel" TEXT,
    "sourceExternalId" TEXT,
    "sourceUrl" TEXT,
    "paidAt" TIMESTAMP(3),
    "fulfilledAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductChannelPublication" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "channelHandle" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unpublishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductChannelPublication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLineItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "title" TEXT NOT NULL,
    "variantTitle" TEXT,
    "sku" TEXT,
    "imageUrl" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitAmount" INTEGER NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SEK',
    "discountAmount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OrderLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "OrderEventType" NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "actorUserId" TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Discount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "method" "DiscountMethod" NOT NULL,
    "valueType" "DiscountValueType" NOT NULL,
    "value" INTEGER NOT NULL,
    "targetType" "DiscountTargetType" NOT NULL,
    "appliesToAllProducts" BOOLEAN NOT NULL DEFAULT true,
    "appliesToAllCustomers" BOOLEAN NOT NULL DEFAULT true,
    "minimumAmount" INTEGER,
    "minimumQuantity" INTEGER,
    "status" "DiscountStatus" NOT NULL DEFAULT 'ACTIVE',
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "usageLimit" INTEGER,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "combinesWithProductDiscounts" BOOLEAN NOT NULL DEFAULT false,
    "combinesWithOrderDiscounts" BOOLEAN NOT NULL DEFAULT false,
    "combinesWithShippingDiscounts" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Discount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountCode" (
    "id" TEXT NOT NULL,
    "discountId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "usageLimit" INTEGER,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscountCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountCondition" (
    "id" TEXT NOT NULL,
    "discountId" TEXT NOT NULL,
    "type" "DiscountConditionType" NOT NULL,
    "intValue" INTEGER,
    "stringValue" TEXT,
    "jsonValue" JSONB,

    CONSTRAINT "DiscountCondition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountProduct" (
    "id" TEXT NOT NULL,
    "discountId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "DiscountProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountCollection" (
    "id" TEXT NOT NULL,
    "discountId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "DiscountCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountSegment" (
    "id" TEXT NOT NULL,
    "discountId" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "DiscountSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountCustomer" (
    "id" TEXT NOT NULL,
    "discountId" TEXT NOT NULL,
    "guestAccountId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "DiscountCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountAllocation" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderLineItemId" TEXT,
    "discountId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscountAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountUsage" (
    "id" TEXT NOT NULL,
    "discountId" TEXT NOT NULL,
    "discountCodeId" TEXT,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "guestAccountId" TEXT,
    "guestEmail" TEXT NOT NULL,
    "discountAmount" INTEGER NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscountUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountEvent" (
    "id" TEXT NOT NULL,
    "discountId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "DiscountEventType" NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "actorUserId" TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscountEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeWebhookEvent" (
    "stripeEventId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "tenantId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,

    CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("stripeEventId")
);

-- CreateTable
CREATE TABLE "OrderNumberSequence" (
    "tenantId" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 1000,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderNumberSequence_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "GiftCardProduct" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Presentkort',
    "description" TEXT NOT NULL DEFAULT '',
    "slug" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "minAmount" INTEGER NOT NULL DEFAULT 50000,
    "maxAmount" INTEGER NOT NULL DEFAULT 1000000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GiftCardProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiftCardDesign" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "config" JSONB,
    "renderedImageUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GiftCardDesign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiftCard" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "designId" TEXT,
    "initialAmount" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "status" "GiftCardStatus" NOT NULL DEFAULT 'PENDING',
    "recipientEmail" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "message" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GiftCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiftCardRedemption" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "giftCardId" TEXT NOT NULL,
    "orderId" TEXT,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GiftCardRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentSession" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "status" "PaymentSessionStatus" NOT NULL DEFAULT 'INITIATED',
    "externalSessionId" TEXT,
    "externalRefundId" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "rawInitResponse" JSONB,

    CONSTRAINT "PaymentSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantPaymentConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL DEFAULT 'bedfront_payments',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "configuredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "configuredBy" TEXT,
    "credentials" TEXT,

    CONSTRAINT "TenantPaymentConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantApp" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "status" "AppStatus" NOT NULL,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "pricingTier" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "TenantApp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantAppEvent" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "AppEventType" NOT NULL,
    "message" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantAppEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantAppWizard" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "currentStepId" TEXT NOT NULL,
    "completedSteps" JSONB NOT NULL DEFAULT '[]',
    "stepData" JSONB NOT NULL DEFAULT '{}',
    "termsAccepted" BOOLEAN NOT NULL DEFAULT false,
    "termsAcceptedAt" TIMESTAMP(3),
    "planSelected" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "abandonedAt" TIMESTAMP(3),

    CONSTRAINT "TenantAppWizard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantAppHealth" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UNCHECKED',
    "latencyMs" INTEGER,
    "message" TEXT,
    "detail" TEXT,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "lastCheckedAt" TIMESTAMP(3),
    "nextCheckAt" TIMESTAMP(3),

    CONSTRAINT "TenantAppHealth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantAppHealthHistory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "latencyMs" INTEGER,
    "message" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantAppHealthHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformEventLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "emittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformEventLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppWebhookDelivery" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "nextRetryAt" TIMESTAMP(3),
    "responseStatus" INTEGER,
    "responseTimeMs" INTEGER,
    "errorMessage" TEXT,
    "exhaustedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppWebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantBillingSettings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "billingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "stripeCustomerId" TEXT,
    "billingEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantBillingSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantBillingPeriod" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "totalAmount" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'SEK',
    "stripeInvoiceId" TEXT,
    "closedAt" TIMESTAMP(3),
    "invoicedAt" TIMESTAMP(3),

    CONSTRAINT "TenantBillingPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingLineItem" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "appName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "isProrated" BOOLEAN NOT NULL DEFAULT false,
    "daysInPeriod" INTEGER,
    "daysCharged" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailMarketingSync" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" "EmailSyncStatus" NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "errorMessage" TEXT,
    "contactData" JSONB NOT NULL,

    CONSTRAINT "EmailMarketingSync_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailAttribution" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "orderId" TEXT,
    "bookingId" TEXT,
    "campaignId" TEXT,
    "revenue" INTEGER NOT NULL,
    "attributedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailAttribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestSegment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestSegmentMembership" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "guestAccountId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "GuestSegmentMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckoutIdempotencyKey" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "routeType" TEXT NOT NULL,
    "status" "CheckoutIdempotencyStatus" NOT NULL DEFAULT 'PROCESSING',
    "responsePayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheckoutIdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RumEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "lcp" DOUBLE PRECISION,
    "inp" DOUBLE PRECISION,
    "cls" DOUBLE PRECISION,
    "sessionId" TEXT NOT NULL,
    "deviceType" TEXT NOT NULL,
    "pathname" TEXT NOT NULL,
    "isHardReload" BOOLEAN NOT NULL,
    "connection" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RumEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RumRateLimit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RumRateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RumDailyAggregate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "sessions" INTEGER NOT NULL DEFAULT 0,
    "sessionsDesktop" INTEGER NOT NULL DEFAULT 0,
    "sessionsMobile" INTEGER NOT NULL DEFAULT 0,
    "sessionsTablet" INTEGER NOT NULL DEFAULT 0,
    "sessionsOther" INTEGER NOT NULL DEFAULT 0,
    "lcpP75" DOUBLE PRECISION,
    "lcpGoodCount" INTEGER NOT NULL DEFAULT 0,
    "lcpNeedsWork" INTEGER NOT NULL DEFAULT 0,
    "lcpPoor" INTEGER NOT NULL DEFAULT 0,
    "lcpCount" INTEGER NOT NULL DEFAULT 0,
    "inpP75" DOUBLE PRECISION,
    "inpGoodCount" INTEGER NOT NULL DEFAULT 0,
    "inpNeedsWork" INTEGER NOT NULL DEFAULT 0,
    "inpPoor" INTEGER NOT NULL DEFAULT 0,
    "inpCount" INTEGER NOT NULL DEFAULT 0,
    "clsP75" DOUBLE PRECISION,
    "clsGoodCount" INTEGER NOT NULL DEFAULT 0,
    "clsNeedsWork" INTEGER NOT NULL DEFAULT 0,
    "clsPoor" INTEGER NOT NULL DEFAULT 0,
    "clsCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RumDailyAggregate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsLocation" (
    "id" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "AnalyticsLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "eventType" "AnalyticsEventType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "page" TEXT,
    "referrer" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "deviceType" "DeviceType" NOT NULL DEFAULT 'DESKTOP',
    "locationId" TEXT,
    "payload" JSONB,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsDailyMetric" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "metric" "AnalyticsMetric" NOT NULL,
    "dimension" "AnalyticsDimension" NOT NULL,
    "dimensionValue" TEXT NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "AnalyticsDailyMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpotMap" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tenantAppId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "imagePublicId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Välj din plats',
    "subtitle" TEXT NOT NULL DEFAULT '',
    "addonPrice" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SEK',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "draftConfig" JSONB,
    "draftUpdatedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpotMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpotMapAccommodation" (
    "id" TEXT NOT NULL,
    "spotMapId" TEXT NOT NULL,
    "accommodationId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpotMapAccommodation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpotMarker" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "spotMapId" TEXT NOT NULL,
    "accommodationId" TEXT NOT NULL,
    "accommodationUnitId" TEXT,
    "label" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "priceOverride" INTEGER,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpotMarker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingSpotReservation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accommodationUnitId" TEXT NOT NULL,
    "checkIn" TIMESTAMP(3) NOT NULL,
    "checkOut" TIMESTAMP(3) NOT NULL,
    "checkoutSessionId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingSpotReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailAppInstallation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" "EmailAppStatus" NOT NULL,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uninstalledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailAppInstallation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailAppTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "previewText" TEXT,
    "blocks" JSONB NOT NULL,
    "type" "EmailTemplateType" NOT NULL,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailAppTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailCampaign" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "segmentId" TEXT,
    "status" "CampaignStatus" NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignRecipient" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" "RecipientStatus" NOT NULL,
    "resendMessageId" TEXT,
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "bouncedAt" TIMESTAMP(3),
    "complainedAt" TIMESTAMP(3),
    "unsubscribedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailAutomation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trigger" "AutomationTrigger" NOT NULL,
    "status" "AutomationStatus" NOT NULL,
    "allowReenrollment" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailAutomation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailAutomationStep" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "delaySeconds" INTEGER NOT NULL DEFAULT 0,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailAutomationStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationEnrollment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "currentStepId" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" "EnrollmentStatus" NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailSuppression" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "reason" "SuppressionReason" NOT NULL,
    "bounceCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailSuppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailBounceEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "bounceType" "BounceType" NOT NULL,
    "resendMessageId" TEXT,
    "rawPayload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailBounceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailCampaignAnalytics" (
    "campaignId" TEXT NOT NULL,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "delivered" INTEGER NOT NULL DEFAULT 0,
    "opened" INTEGER NOT NULL DEFAULT 0,
    "clicked" INTEGER NOT NULL DEFAULT 0,
    "bounced" INTEGER NOT NULL DEFAULT 0,
    "complained" INTEGER NOT NULL DEFAULT 0,
    "unsubscribed" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailCampaignAnalytics_pkey" PRIMARY KEY ("campaignId")
);

-- CreateTable
CREATE TABLE "EmailAutomationAnalytics" (
    "automationId" TEXT NOT NULL,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "delivered" INTEGER NOT NULL DEFAULT 0,
    "opened" INTEGER NOT NULL DEFAULT 0,
    "clicked" INTEGER NOT NULL DEFAULT 0,
    "bounced" INTEGER NOT NULL DEFAULT 0,
    "complained" INTEGER NOT NULL DEFAULT 0,
    "unsubscribed" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailAutomationAnalytics_pkey" PRIMARY KEY ("automationId")
);

-- CreateIndex
CREATE INDEX "PendingBookingLock_expiresAt_idx" ON "PendingBookingLock"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_clerkOrgId_key" ON "Tenant"("clerkOrgId");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_portalSlug_key" ON "Tenant"("portalSlug");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_emailVerificationToken_key" ON "Tenant"("emailVerificationToken");

-- CreateIndex
CREATE INDEX "Tenant_slug_idx" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Tenant_clerkOrgId_idx" ON "Tenant"("clerkOrgId");

-- CreateIndex
CREATE INDEX "TenantPolicy_tenantId_idx" ON "TenantPolicy"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantPolicy_tenantId_policyId_key" ON "TenantPolicy"("tenantId", "policyId");

-- CreateIndex
CREATE INDEX "BusinessEntity_tenantId_idx" ON "BusinessEntity"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_externalId_key" ON "Booking"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_portalToken_key" ON "Booking"("portalToken");

-- CreateIndex
CREATE INDEX "Booking_tenantId_idx" ON "Booking"("tenantId");

-- CreateIndex
CREATE INDEX "Booking_guestEmail_idx" ON "Booking"("guestEmail");

-- CreateIndex
CREATE INDEX "Booking_status_idx" ON "Booking"("status");

-- CreateIndex
CREATE INDEX "Booking_arrival_idx" ON "Booking"("arrival");

-- CreateIndex
CREATE INDEX "Booking_tenantId_externalId_idx" ON "Booking"("tenantId", "externalId");

-- CreateIndex
CREATE INDEX "Booking_tenantId_guestEmail_idx" ON "Booking"("tenantId", "guestEmail");

-- CreateIndex
CREATE INDEX "Booking_tenantId_guestAccountId_idx" ON "Booking"("tenantId", "guestAccountId");

-- CreateIndex
CREATE INDEX "Booking_accommodationId_idx" ON "Booking"("accommodationId");

-- CreateIndex
CREATE INDEX "Booking_orderId_idx" ON "Booking"("orderId");

-- CreateIndex
CREATE INDEX "Booking_tenantId_accommodationId_idx" ON "Booking"("tenantId", "accommodationId");

-- CreateIndex
CREATE UNIQUE INDEX "MagicLink_token_key" ON "MagicLink"("token");

-- CreateIndex
CREATE INDEX "MagicLink_token_idx" ON "MagicLink"("token");

-- CreateIndex
CREATE INDEX "MagicLink_bookingId_idx" ON "MagicLink"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantIntegration_tenantId_key" ON "TenantIntegration"("tenantId");

-- CreateIndex
CREATE INDEX "TenantIntegration_provider_externalTenantId_idx" ON "TenantIntegration"("provider", "externalTenantId");

-- CreateIndex
CREATE INDEX "SyncJob_tenantId_status_idx" ON "SyncJob"("tenantId", "status");

-- CreateIndex
CREATE INDEX "SyncJob_scheduledAt_status_idx" ON "SyncJob"("scheduledAt", "status");

-- CreateIndex
CREATE INDEX "SyncEvent_tenantId_createdAt_idx" ON "SyncEvent"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "SyncEvent_tenantId_eventType_idx" ON "SyncEvent"("tenantId", "eventType");

-- CreateIndex
CREATE UNIQUE INDEX "RateLimit_key_key" ON "RateLimit"("key");

-- CreateIndex
CREATE INDEX "BookingSyncError_tenantId_resolvedAt_idx" ON "BookingSyncError"("tenantId", "resolvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BookingSyncError_tenantId_externalId_key" ON "BookingSyncError"("tenantId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookDedup_dedupKey_key" ON "WebhookDedup"("dedupKey");

-- CreateIndex
CREATE INDEX "WebhookDedup_createdAt_idx" ON "WebhookDedup"("createdAt");

-- CreateIndex
CREATE INDEX "WebhookEvent_id_idx" ON "WebhookEvent"("id");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_publicId_key" ON "MediaAsset"("publicId");

-- CreateIndex
CREATE INDEX "MediaAsset_tenantId_idx" ON "MediaAsset"("tenantId");

-- CreateIndex
CREATE INDEX "MediaAsset_tenantId_folder_idx" ON "MediaAsset"("tenantId", "folder");

-- CreateIndex
CREATE INDEX "MediaAsset_tenantId_deletedAt_idx" ON "MediaAsset"("tenantId", "deletedAt");

-- CreateIndex
CREATE INDEX "MediaAsset_tenantId_createdAt_idx" ON "MediaAsset"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "MediaAsset_tenantId_mimeType_idx" ON "MediaAsset"("tenantId", "mimeType");

-- CreateIndex
CREATE INDEX "MediaAsset_deletedAt_idx" ON "MediaAsset"("deletedAt");

-- CreateIndex
CREATE INDEX "TenantLocale_tenantId_published_idx" ON "TenantLocale"("tenantId", "published");

-- CreateIndex
CREATE UNIQUE INDEX "TenantLocale_tenantId_locale_key" ON "TenantLocale"("tenantId", "locale");

-- CreateIndex
CREATE INDEX "TenantTranslation_tenantId_locale_idx" ON "TenantTranslation"("tenantId", "locale");

-- CreateIndex
CREATE INDEX "TenantTranslation_tenantId_resourceId_idx" ON "TenantTranslation"("tenantId", "resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantTranslation_tenantId_locale_resourceId_key" ON "TenantTranslation"("tenantId", "locale", "resourceId");

-- CreateIndex
CREATE INDEX "EmailTemplate_tenantId_idx" ON "EmailTemplate"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_tenantId_eventType_key" ON "EmailTemplate"("tenantId", "eventType");

-- CreateIndex
CREATE INDEX "EmailSendLog_tenantId_idx" ON "EmailSendLog"("tenantId");

-- CreateIndex
CREATE INDEX "EmailSendLog_resendId_idx" ON "EmailSendLog"("resendId");

-- CreateIndex
CREATE INDEX "EmailSendLog_toEmail_idx" ON "EmailSendLog"("toEmail");

-- CreateIndex
CREATE INDEX "EmailSendLog_tenantId_eventType_idx" ON "EmailSendLog"("tenantId", "eventType");

-- CreateIndex
CREATE INDEX "EmailSendLog_status_nextRetryAt_idx" ON "EmailSendLog"("status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "EmailSendLog_orderId_eventType_idx" ON "EmailSendLog"("orderId", "eventType");

-- CreateIndex
CREATE INDEX "EmailSendLog_bookingId_eventType_idx" ON "EmailSendLog"("bookingId", "eventType");

-- CreateIndex
CREATE INDEX "EmailUnsubscribe_tenantId_idx" ON "EmailUnsubscribe"("tenantId");

-- CreateIndex
CREATE INDEX "EmailUnsubscribe_email_idx" ON "EmailUnsubscribe"("email");

-- CreateIndex
CREATE UNIQUE INDEX "EmailUnsubscribe_tenantId_email_key" ON "EmailUnsubscribe"("tenantId", "email");

-- CreateIndex
CREATE INDEX "EmailDomain_tenantId_idx" ON "EmailDomain"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailDomain_tenantId_domain_key" ON "EmailDomain"("tenantId", "domain");

-- CreateIndex
CREATE UNIQUE INDEX "MagicLinkToken_token_key" ON "MagicLinkToken"("token");

-- CreateIndex
CREATE INDEX "MagicLinkToken_token_idx" ON "MagicLinkToken"("token");

-- CreateIndex
CREATE INDEX "MagicLinkToken_tenantId_email_idx" ON "MagicLinkToken"("tenantId", "email");

-- CreateIndex
CREATE INDEX "MagicLinkToken_expiresAt_idx" ON "MagicLinkToken"("expiresAt");

-- CreateIndex
CREATE INDEX "EmailRateLimit_tenantId_email_eventType_sentAt_idx" ON "EmailRateLimit"("tenantId", "email", "eventType", "sentAt");

-- CreateIndex
CREATE INDEX "GuestAccount_tenantId_idx" ON "GuestAccount"("tenantId");

-- CreateIndex
CREATE INDEX "GuestAccount_email_idx" ON "GuestAccount"("email");

-- CreateIndex
CREATE INDEX "GuestAccount_tenantId_state_idx" ON "GuestAccount"("tenantId", "state");

-- CreateIndex
CREATE INDEX "GuestAccount_tenantId_emailMarketingState_idx" ON "GuestAccount"("tenantId", "emailMarketingState");

-- CreateIndex
CREATE INDEX "GuestAccount_tenantId_createdAt_idx" ON "GuestAccount"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GuestAccount_tenantId_email_key" ON "GuestAccount"("tenantId", "email");

-- CreateIndex
CREATE INDEX "GuestOtpCode_guestAccountId_idx" ON "GuestOtpCode"("guestAccountId");

-- CreateIndex
CREATE INDEX "GuestTag_tenantId_tag_idx" ON "GuestTag"("tenantId", "tag");

-- CreateIndex
CREATE INDEX "GuestTag_guestAccountId_idx" ON "GuestTag"("guestAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "GuestTag_tenantId_guestAccountId_tag_key" ON "GuestTag"("tenantId", "guestAccountId", "tag");

-- CreateIndex
CREATE INDEX "GuestNote_tenantId_guestAccountId_idx" ON "GuestNote"("tenantId", "guestAccountId");

-- CreateIndex
CREATE INDEX "GuestAccountEvent_tenantId_guestAccountId_idx" ON "GuestAccountEvent"("tenantId", "guestAccountId");

-- CreateIndex
CREATE INDEX "GuestAccountEvent_tenantId_type_idx" ON "GuestAccountEvent"("tenantId", "type");

-- CreateIndex
CREATE INDEX "GuestAccountEvent_guestAccountId_createdAt_idx" ON "GuestAccountEvent"("guestAccountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GuestAccountEvent_guestAccountId_orderId_type_key" ON "GuestAccountEvent"("guestAccountId", "orderId", "type");

-- CreateIndex
CREATE INDEX "GuestAddress_tenantId_guestAccountId_idx" ON "GuestAddress"("tenantId", "guestAccountId");

-- CreateIndex
CREATE INDEX "GuestAddress_guestAccountId_isDefault_idx" ON "GuestAddress"("guestAccountId", "isDefault");

-- CreateIndex
CREATE INDEX "Product_tenantId_idx" ON "Product"("tenantId");

-- CreateIndex
CREATE INDEX "Product_tenantId_status_idx" ON "Product"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Product_tenantId_productType_idx" ON "Product"("tenantId", "productType");

-- CreateIndex
CREATE INDEX "Product_tenantId_sortOrder_idx" ON "Product"("tenantId", "sortOrder");

-- CreateIndex
CREATE INDEX "Product_tenantId_archivedAt_idx" ON "Product"("tenantId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Product_tenantId_slug_key" ON "Product"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "ProductMedia_productId_idx" ON "ProductMedia"("productId");

-- CreateIndex
CREATE INDEX "ProductMedia_productId_sortOrder_idx" ON "ProductMedia"("productId", "sortOrder");

-- CreateIndex
CREATE INDEX "ProductOption_productId_idx" ON "ProductOption"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductOption_productId_name_key" ON "ProductOption"("productId", "name");

-- CreateIndex
CREATE INDEX "ProductVariant_productId_idx" ON "ProductVariant"("productId");

-- CreateIndex
CREATE INDEX "ProductVariant_productId_sortOrder_idx" ON "ProductVariant"("productId", "sortOrder");

-- CreateIndex
CREATE INDEX "ProductVariant_productId_sku_idx" ON "ProductVariant"("productId", "sku");

-- CreateIndex
CREATE INDEX "ProductTemplate_tenantId_idx" ON "ProductTemplate"("tenantId");

-- CreateIndex
CREATE INDEX "ProductTemplate_tenantId_isDefault_idx" ON "ProductTemplate"("tenantId", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "ProductTemplate_tenantId_suffix_key" ON "ProductTemplate"("tenantId", "suffix");

-- CreateIndex
CREATE INDEX "ProductCollection_tenantId_idx" ON "ProductCollection"("tenantId");

-- CreateIndex
CREATE INDEX "ProductCollection_tenantId_status_idx" ON "ProductCollection"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ProductCollection_tenantId_sortOrder_idx" ON "ProductCollection"("tenantId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCollection_tenantId_slug_key" ON "ProductCollection"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "ProductCollectionItem_collectionId_sortOrder_idx" ON "ProductCollectionItem"("collectionId", "sortOrder");

-- CreateIndex
CREATE INDEX "ProductCollectionItem_productId_idx" ON "ProductCollectionItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCollectionItem_collectionId_productId_key" ON "ProductCollectionItem"("collectionId", "productId");

-- CreateIndex
CREATE INDEX "Accommodation_tenantId_idx" ON "Accommodation"("tenantId");

-- CreateIndex
CREATE INDEX "Accommodation_tenantId_status_idx" ON "Accommodation"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Accommodation_tenantId_accommodationType_idx" ON "Accommodation"("tenantId", "accommodationType");

-- CreateIndex
CREATE INDEX "Accommodation_tenantId_sortOrder_idx" ON "Accommodation"("tenantId", "sortOrder");

-- CreateIndex
CREATE INDEX "Accommodation_tenantId_archivedAt_idx" ON "Accommodation"("tenantId", "archivedAt");

-- CreateIndex
CREATE INDEX "Accommodation_tenantId_pmsProvider_externalId_idx" ON "Accommodation"("tenantId", "pmsProvider", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Accommodation_tenantId_slug_key" ON "Accommodation"("tenantId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Accommodation_tenantId_externalId_pmsProvider_key" ON "Accommodation"("tenantId", "externalId", "pmsProvider");

-- CreateIndex
CREATE INDEX "AccommodationHighlight_accommodationId_idx" ON "AccommodationHighlight"("accommodationId");

-- CreateIndex
CREATE INDEX "AccommodationHighlight_accommodationId_sortOrder_idx" ON "AccommodationHighlight"("accommodationId", "sortOrder");

-- CreateIndex
CREATE INDEX "AccommodationUnit_tenantId_idx" ON "AccommodationUnit"("tenantId");

-- CreateIndex
CREATE INDEX "AccommodationUnit_accommodationId_idx" ON "AccommodationUnit"("accommodationId");

-- CreateIndex
CREATE INDEX "AccommodationUnit_tenantId_status_idx" ON "AccommodationUnit"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AccommodationUnit_tenantId_accommodationId_name_key" ON "AccommodationUnit"("tenantId", "accommodationId", "name");

-- CreateIndex
CREATE INDEX "AccommodationFacility_accommodationId_idx" ON "AccommodationFacility"("accommodationId");

-- CreateIndex
CREATE UNIQUE INDEX "AccommodationFacility_accommodationId_facilityType_key" ON "AccommodationFacility"("accommodationId", "facilityType");

-- CreateIndex
CREATE INDEX "BedConfiguration_accommodationId_idx" ON "BedConfiguration"("accommodationId");

-- CreateIndex
CREATE UNIQUE INDEX "BedConfiguration_accommodationId_bedType_key" ON "BedConfiguration"("accommodationId", "bedType");

-- CreateIndex
CREATE INDEX "RatePlan_tenantId_idx" ON "RatePlan"("tenantId");

-- CreateIndex
CREATE INDEX "RatePlan_accommodationId_idx" ON "RatePlan"("accommodationId");

-- CreateIndex
CREATE INDEX "RatePlan_accommodationId_status_idx" ON "RatePlan"("accommodationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RatePlan_accommodationId_externalId_key" ON "RatePlan"("accommodationId", "externalId");

-- CreateIndex
CREATE INDEX "AccommodationRestriction_tenantId_idx" ON "AccommodationRestriction"("tenantId");

-- CreateIndex
CREATE INDEX "AccommodationRestriction_accommodationId_idx" ON "AccommodationRestriction"("accommodationId");

-- CreateIndex
CREATE INDEX "AccommodationRestriction_accommodationId_date_idx" ON "AccommodationRestriction"("accommodationId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AccommodationRestriction_accommodationId_restrictionType_da_key" ON "AccommodationRestriction"("accommodationId", "restrictionType", "date");

-- CreateIndex
CREATE INDEX "AccommodationMedia_accommodationId_idx" ON "AccommodationMedia"("accommodationId");

-- CreateIndex
CREATE INDEX "AccommodationMedia_accommodationId_sortOrder_idx" ON "AccommodationMedia"("accommodationId", "sortOrder");

-- CreateIndex
CREATE INDEX "AccommodationCategory_tenantId_idx" ON "AccommodationCategory"("tenantId");

-- CreateIndex
CREATE INDEX "AccommodationCategory_tenantId_status_idx" ON "AccommodationCategory"("tenantId", "status");

-- CreateIndex
CREATE INDEX "AccommodationCategory_tenantId_visibleInSearch_idx" ON "AccommodationCategory"("tenantId", "visibleInSearch");

-- CreateIndex
CREATE INDEX "AccommodationCategory_tenantId_sortOrder_idx" ON "AccommodationCategory"("tenantId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "AccommodationCategory_tenantId_slug_key" ON "AccommodationCategory"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "AccommodationCategoryItem_categoryId_sortOrder_idx" ON "AccommodationCategoryItem"("categoryId", "sortOrder");

-- CreateIndex
CREATE INDEX "AccommodationCategoryItem_accommodationId_idx" ON "AccommodationCategoryItem"("accommodationId");

-- CreateIndex
CREATE UNIQUE INDEX "AccommodationCategoryItem_categoryId_accommodationId_key" ON "AccommodationCategoryItem"("categoryId", "accommodationId");

-- CreateIndex
CREATE INDEX "AccommodationCategoryAddon_categoryId_sortOrder_idx" ON "AccommodationCategoryAddon"("categoryId", "sortOrder");

-- CreateIndex
CREATE INDEX "AccommodationCategoryAddon_collectionId_idx" ON "AccommodationCategoryAddon"("collectionId");

-- CreateIndex
CREATE UNIQUE INDEX "AccommodationCategoryAddon_categoryId_collectionId_key" ON "AccommodationCategoryAddon"("categoryId", "collectionId");

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutSession_token_key" ON "CheckoutSession"("token");

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutSession_dedupKey_key" ON "CheckoutSession"("dedupKey");

-- CreateIndex
CREATE INDEX "CheckoutSession_tenantId_status_idx" ON "CheckoutSession"("tenantId", "status");

-- CreateIndex
CREATE INDEX "CheckoutSession_expiresAt_idx" ON "CheckoutSession"("expiresAt");

-- CreateIndex
CREATE INDEX "ProductTag_tenantId_idx" ON "ProductTag"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductTag_tenantId_name_key" ON "ProductTag"("tenantId", "name");

-- CreateIndex
CREATE INDEX "ProductTagItem_productId_idx" ON "ProductTagItem"("productId");

-- CreateIndex
CREATE INDEX "ProductTagItem_tagId_idx" ON "ProductTagItem"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductTagItem_productId_tagId_key" ON "ProductTagItem"("productId", "tagId");

-- CreateIndex
CREATE INDEX "InventoryChange_productId_idx" ON "InventoryChange"("productId");

-- CreateIndex
CREATE INDEX "InventoryChange_variantId_idx" ON "InventoryChange"("variantId");

-- CreateIndex
CREATE INDEX "InventoryChange_tenantId_productId_idx" ON "InventoryChange"("tenantId", "productId");

-- CreateIndex
CREATE INDEX "InventoryChange_tenantId_createdAt_idx" ON "InventoryChange"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryChange_reason_idx" ON "InventoryChange"("reason");

-- CreateIndex
CREATE INDEX "PriceChange_productId_idx" ON "PriceChange"("productId");

-- CreateIndex
CREATE INDEX "PriceChange_tenantId_productId_idx" ON "PriceChange"("tenantId", "productId");

-- CreateIndex
CREATE INDEX "PriceChange_tenantId_createdAt_idx" ON "PriceChange"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryReservation_tenantId_productId_idx" ON "InventoryReservation"("tenantId", "productId");

-- CreateIndex
CREATE INDEX "InventoryReservation_tenantId_variantId_idx" ON "InventoryReservation"("tenantId", "variantId");

-- CreateIndex
CREATE INDEX "InventoryReservation_expiresAt_idx" ON "InventoryReservation"("expiresAt");

-- CreateIndex
CREATE INDEX "InventoryReservation_sessionId_idx" ON "InventoryReservation"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_stripeCheckoutSessionId_key" ON "Order"("stripeCheckoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_stripePaymentIntentId_key" ON "Order"("stripePaymentIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_statusToken_key" ON "Order"("statusToken");

-- CreateIndex
CREATE INDEX "Order_tenantId_status_idx" ON "Order"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Order_tenantId_createdAt_idx" ON "Order"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_guestEmail_idx" ON "Order"("guestEmail");

-- CreateIndex
CREATE INDEX "Order_guestAccountId_idx" ON "Order"("guestAccountId");

-- CreateIndex
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Order_tenantId_sourceChannel_idx" ON "Order"("tenantId", "sourceChannel");

-- CreateIndex
CREATE INDEX "Order_tenantId_financialStatus_idx" ON "Order"("tenantId", "financialStatus");

-- CreateIndex
CREATE INDEX "Order_tenantId_financialStatus_createdAt_idx" ON "Order"("tenantId", "financialStatus", "createdAt");

-- CreateIndex
CREATE INDEX "Order_tenantId_fulfillmentStatus_idx" ON "Order"("tenantId", "fulfillmentStatus");

-- CreateIndex
CREATE UNIQUE INDEX "Order_tenantId_orderNumber_key" ON "Order"("tenantId", "orderNumber");

-- CreateIndex
CREATE INDEX "ProductChannelPublication_tenantId_channelHandle_idx" ON "ProductChannelPublication"("tenantId", "channelHandle");

-- CreateIndex
CREATE INDEX "ProductChannelPublication_tenantId_productId_idx" ON "ProductChannelPublication"("tenantId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductChannelPublication_tenantId_productId_channelHandle_key" ON "ProductChannelPublication"("tenantId", "productId", "channelHandle");

-- CreateIndex
CREATE INDEX "OrderLineItem_orderId_idx" ON "OrderLineItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderLineItem_productId_idx" ON "OrderLineItem"("productId");

-- CreateIndex
CREATE INDEX "OrderEvent_orderId_createdAt_idx" ON "OrderEvent"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderEvent_tenantId_orderId_idx" ON "OrderEvent"("tenantId", "orderId");

-- CreateIndex
CREATE INDEX "Discount_tenantId_status_idx" ON "Discount"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Discount_tenantId_method_idx" ON "Discount"("tenantId", "method");

-- CreateIndex
CREATE INDEX "Discount_tenantId_startsAt_endsAt_idx" ON "Discount"("tenantId", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "DiscountCode_discountId_idx" ON "DiscountCode"("discountId");

-- CreateIndex
CREATE INDEX "DiscountCode_tenantId_isActive_idx" ON "DiscountCode"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountCode_tenantId_code_key" ON "DiscountCode"("tenantId", "code");

-- CreateIndex
CREATE INDEX "DiscountCondition_discountId_idx" ON "DiscountCondition"("discountId");

-- CreateIndex
CREATE INDEX "DiscountCondition_discountId_type_idx" ON "DiscountCondition"("discountId", "type");

-- CreateIndex
CREATE INDEX "DiscountProduct_discountId_idx" ON "DiscountProduct"("discountId");

-- CreateIndex
CREATE INDEX "DiscountProduct_tenantId_productId_idx" ON "DiscountProduct"("tenantId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountProduct_discountId_productId_key" ON "DiscountProduct"("discountId", "productId");

-- CreateIndex
CREATE INDEX "DiscountCollection_discountId_idx" ON "DiscountCollection"("discountId");

-- CreateIndex
CREATE INDEX "DiscountCollection_tenantId_collectionId_idx" ON "DiscountCollection"("tenantId", "collectionId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountCollection_discountId_collectionId_key" ON "DiscountCollection"("discountId", "collectionId");

-- CreateIndex
CREATE INDEX "DiscountSegment_discountId_idx" ON "DiscountSegment"("discountId");

-- CreateIndex
CREATE INDEX "DiscountSegment_tenantId_segmentId_idx" ON "DiscountSegment"("tenantId", "segmentId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountSegment_discountId_segmentId_key" ON "DiscountSegment"("discountId", "segmentId");

-- CreateIndex
CREATE INDEX "DiscountCustomer_discountId_idx" ON "DiscountCustomer"("discountId");

-- CreateIndex
CREATE INDEX "DiscountCustomer_tenantId_guestAccountId_idx" ON "DiscountCustomer"("tenantId", "guestAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountCustomer_discountId_guestAccountId_key" ON "DiscountCustomer"("discountId", "guestAccountId");

-- CreateIndex
CREATE INDEX "DiscountAllocation_orderId_idx" ON "DiscountAllocation"("orderId");

-- CreateIndex
CREATE INDEX "DiscountAllocation_discountId_idx" ON "DiscountAllocation"("discountId");

-- CreateIndex
CREATE INDEX "DiscountAllocation_tenantId_idx" ON "DiscountAllocation"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountUsage_orderId_key" ON "DiscountUsage"("orderId");

-- CreateIndex
CREATE INDEX "DiscountUsage_discountId_createdAt_idx" ON "DiscountUsage"("discountId", "createdAt");

-- CreateIndex
CREATE INDEX "DiscountUsage_tenantId_guestEmail_idx" ON "DiscountUsage"("tenantId", "guestEmail");

-- CreateIndex
CREATE INDEX "DiscountUsage_tenantId_discountId_idx" ON "DiscountUsage"("tenantId", "discountId");

-- CreateIndex
CREATE INDEX "DiscountEvent_discountId_createdAt_idx" ON "DiscountEvent"("discountId", "createdAt");

-- CreateIndex
CREATE INDEX "DiscountEvent_tenantId_idx" ON "DiscountEvent"("tenantId");

-- CreateIndex
CREATE INDEX "StripeWebhookEvent_tenantId_idx" ON "StripeWebhookEvent"("tenantId");

-- CreateIndex
CREATE INDEX "GiftCardProduct_tenantId_idx" ON "GiftCardProduct"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "GiftCardProduct_tenantId_slug_key" ON "GiftCardProduct"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "GiftCardDesign_tenantId_idx" ON "GiftCardDesign"("tenantId");

-- CreateIndex
CREATE INDEX "GiftCardDesign_productId_idx" ON "GiftCardDesign"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "GiftCard_orderId_key" ON "GiftCard"("orderId");

-- CreateIndex
CREATE INDEX "GiftCard_tenantId_idx" ON "GiftCard"("tenantId");

-- CreateIndex
CREATE INDEX "GiftCard_orderId_idx" ON "GiftCard"("orderId");

-- CreateIndex
CREATE INDEX "GiftCard_tenantId_status_scheduledAt_idx" ON "GiftCard"("tenantId", "status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "GiftCard_tenantId_code_key" ON "GiftCard"("tenantId", "code");

-- CreateIndex
CREATE INDEX "GiftCardRedemption_giftCardId_idx" ON "GiftCardRedemption"("giftCardId");

-- CreateIndex
CREATE INDEX "GiftCardRedemption_tenantId_idx" ON "GiftCardRedemption"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentSession_orderId_key" ON "PaymentSession"("orderId");

-- CreateIndex
CREATE INDEX "PaymentSession_providerKey_status_idx" ON "PaymentSession"("providerKey", "status");

-- CreateIndex
CREATE INDEX "PaymentSession_tenantId_status_idx" ON "PaymentSession"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TenantPaymentConfig_tenantId_key" ON "TenantPaymentConfig"("tenantId");

-- CreateIndex
CREATE INDEX "TenantApp_tenantId_status_idx" ON "TenantApp"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TenantApp_tenantId_appId_key" ON "TenantApp"("tenantId", "appId");

-- CreateIndex
CREATE INDEX "TenantAppEvent_tenantId_appId_idx" ON "TenantAppEvent"("tenantId", "appId");

-- CreateIndex
CREATE INDEX "TenantAppEvent_tenantId_createdAt_idx" ON "TenantAppEvent"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "TenantAppWizard_tenantId_idx" ON "TenantAppWizard"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantAppWizard_tenantId_appId_key" ON "TenantAppWizard"("tenantId", "appId");

-- CreateIndex
CREATE INDEX "TenantAppHealth_tenantId_idx" ON "TenantAppHealth"("tenantId");

-- CreateIndex
CREATE INDEX "TenantAppHealth_nextCheckAt_idx" ON "TenantAppHealth"("nextCheckAt");

-- CreateIndex
CREATE UNIQUE INDEX "TenantAppHealth_tenantId_appId_key" ON "TenantAppHealth"("tenantId", "appId");

-- CreateIndex
CREATE INDEX "TenantAppHealthHistory_tenantId_appId_checkedAt_idx" ON "TenantAppHealthHistory"("tenantId", "appId", "checkedAt");

-- CreateIndex
CREATE INDEX "TenantAppHealthHistory_checkedAt_idx" ON "TenantAppHealthHistory"("checkedAt");

-- CreateIndex
CREATE INDEX "PlatformEventLog_tenantId_emittedAt_idx" ON "PlatformEventLog"("tenantId", "emittedAt");

-- CreateIndex
CREATE INDEX "PlatformEventLog_tenantId_eventType_idx" ON "PlatformEventLog"("tenantId", "eventType");

-- CreateIndex
CREATE INDEX "AppWebhookDelivery_tenantId_appId_createdAt_idx" ON "AppWebhookDelivery"("tenantId", "appId", "createdAt");

-- CreateIndex
CREATE INDEX "AppWebhookDelivery_status_nextRetryAt_idx" ON "AppWebhookDelivery"("status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "AppWebhookDelivery_tenantId_appId_status_idx" ON "AppWebhookDelivery"("tenantId", "appId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AppWebhookDelivery_eventId_appId_key" ON "AppWebhookDelivery"("eventId", "appId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantBillingSettings_tenantId_key" ON "TenantBillingSettings"("tenantId");

-- CreateIndex
CREATE INDEX "TenantBillingPeriod_tenantId_status_idx" ON "TenantBillingPeriod"("tenantId", "status");

-- CreateIndex
CREATE INDEX "TenantBillingPeriod_status_periodEnd_idx" ON "TenantBillingPeriod"("status", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "TenantBillingPeriod_tenantId_periodStart_key" ON "TenantBillingPeriod"("tenantId", "periodStart");

-- CreateIndex
CREATE INDEX "BillingLineItem_periodId_idx" ON "BillingLineItem"("periodId");

-- CreateIndex
CREATE INDEX "BillingLineItem_tenantId_appId_idx" ON "BillingLineItem"("tenantId", "appId");

-- CreateIndex
CREATE INDEX "BillingLineItem_tenantId_createdAt_idx" ON "BillingLineItem"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "EmailMarketingSync_tenantId_appId_idx" ON "EmailMarketingSync"("tenantId", "appId");

-- CreateIndex
CREATE INDEX "EmailMarketingSync_tenantId_status_idx" ON "EmailMarketingSync"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EmailMarketingSync_tenantId_appId_email_key" ON "EmailMarketingSync"("tenantId", "appId", "email");

-- CreateIndex
CREATE INDEX "EmailAttribution_tenantId_appId_idx" ON "EmailAttribution"("tenantId", "appId");

-- CreateIndex
CREATE INDEX "EmailAttribution_tenantId_attributedAt_idx" ON "EmailAttribution"("tenantId", "attributedAt");

-- CreateIndex
CREATE INDEX "EmailAttribution_orderId_idx" ON "EmailAttribution"("orderId");

-- CreateIndex
CREATE INDEX "GuestSegment_tenantId_idx" ON "GuestSegment"("tenantId");

-- CreateIndex
CREATE INDEX "GuestSegment_tenantId_isDefault_idx" ON "GuestSegment"("tenantId", "isDefault");

-- CreateIndex
CREATE INDEX "GuestSegmentMembership_tenantId_segmentId_idx" ON "GuestSegmentMembership"("tenantId", "segmentId");

-- CreateIndex
CREATE INDEX "GuestSegmentMembership_tenantId_guestAccountId_idx" ON "GuestSegmentMembership"("tenantId", "guestAccountId");

-- CreateIndex
CREATE INDEX "GuestSegmentMembership_segmentId_leftAt_idx" ON "GuestSegmentMembership"("segmentId", "leftAt");

-- CreateIndex
CREATE UNIQUE INDEX "GuestSegmentMembership_segmentId_guestAccountId_key" ON "GuestSegmentMembership"("segmentId", "guestAccountId");

-- CreateIndex
CREATE INDEX "CheckoutIdempotencyKey_expiresAt_idx" ON "CheckoutIdempotencyKey"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutIdempotencyKey_tenantId_key_routeType_key" ON "CheckoutIdempotencyKey"("tenantId", "key", "routeType");

-- CreateIndex
CREATE INDEX "RumEvent_tenantId_createdAt_idx" ON "RumEvent"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "RumEvent_tenantId_sessionId_idx" ON "RumEvent"("tenantId", "sessionId");

-- CreateIndex
CREATE INDEX "RumEvent_tenantId_deviceType_createdAt_idx" ON "RumEvent"("tenantId", "deviceType", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RumRateLimit_tenantId_key" ON "RumRateLimit"("tenantId");

-- CreateIndex
CREATE INDEX "RumRateLimit_tenantId_idx" ON "RumRateLimit"("tenantId");

-- CreateIndex
CREATE INDEX "RumDailyAggregate_tenantId_date_idx" ON "RumDailyAggregate"("tenantId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "RumDailyAggregate_tenantId_date_key" ON "RumDailyAggregate"("tenantId", "date");

-- CreateIndex
CREATE INDEX "AnalyticsLocation_country_idx" ON "AnalyticsLocation"("country");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsLocation_country_city_key" ON "AnalyticsLocation"("country", "city");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_tenantId_idx" ON "AnalyticsEvent"("tenantId");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_tenantId_eventType_idx" ON "AnalyticsEvent"("tenantId", "eventType");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_tenantId_sessionId_idx" ON "AnalyticsEvent"("tenantId", "sessionId");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_tenantId_visitorId_idx" ON "AnalyticsEvent"("tenantId", "visitorId");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_tenantId_occurredAt_idx" ON "AnalyticsEvent"("tenantId", "occurredAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_tenantId_occurredAt_eventType_idx" ON "AnalyticsEvent"("tenantId", "occurredAt", "eventType");

-- CreateIndex
CREATE INDEX "AnalyticsDailyMetric_tenantId_date_idx" ON "AnalyticsDailyMetric"("tenantId", "date");

-- CreateIndex
CREATE INDEX "AnalyticsDailyMetric_tenantId_metric_date_idx" ON "AnalyticsDailyMetric"("tenantId", "metric", "date");

-- CreateIndex
CREATE INDEX "AnalyticsDailyMetric_tenantId_dimension_date_idx" ON "AnalyticsDailyMetric"("tenantId", "dimension", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsDailyMetric_tenantId_date_metric_dimension_dimensi_key" ON "AnalyticsDailyMetric"("tenantId", "date", "metric", "dimension", "dimensionValue");

-- CreateIndex
CREATE INDEX "SpotMap_tenantId_idx" ON "SpotMap"("tenantId");

-- CreateIndex
CREATE INDEX "SpotMapAccommodation_spotMapId_idx" ON "SpotMapAccommodation"("spotMapId");

-- CreateIndex
CREATE UNIQUE INDEX "SpotMapAccommodation_accommodationId_key" ON "SpotMapAccommodation"("accommodationId");

-- CreateIndex
CREATE INDEX "SpotMarker_tenantId_idx" ON "SpotMarker"("tenantId");

-- CreateIndex
CREATE INDEX "SpotMarker_spotMapId_idx" ON "SpotMarker"("spotMapId");

-- CreateIndex
CREATE INDEX "SpotMarker_accommodationUnitId_idx" ON "SpotMarker"("accommodationUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "PendingSpotReservation_checkoutSessionId_key" ON "PendingSpotReservation"("checkoutSessionId");

-- CreateIndex
CREATE INDEX "PendingSpotReservation_tenantId_accommodationUnitId_checkIn_idx" ON "PendingSpotReservation"("tenantId", "accommodationUnitId", "checkIn", "checkOut");

-- CreateIndex
CREATE INDEX "PendingSpotReservation_expiresAt_idx" ON "PendingSpotReservation"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailAppInstallation_tenantId_key" ON "EmailAppInstallation"("tenantId");

-- CreateIndex
CREATE INDEX "EmailAppTemplate_tenantId_idx" ON "EmailAppTemplate"("tenantId");

-- CreateIndex
CREATE INDEX "EmailCampaign_tenantId_status_idx" ON "EmailCampaign"("tenantId", "status");

-- CreateIndex
CREATE INDEX "CampaignRecipient_resendMessageId_idx" ON "CampaignRecipient"("resendMessageId");

-- CreateIndex
CREATE INDEX "CampaignRecipient_campaignId_status_idx" ON "CampaignRecipient"("campaignId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignRecipient_campaignId_guestId_key" ON "CampaignRecipient"("campaignId", "guestId");

-- CreateIndex
CREATE INDEX "EmailAutomation_tenantId_idx" ON "EmailAutomation"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailAutomationStep_automationId_order_key" ON "EmailAutomationStep"("automationId", "order");

-- CreateIndex
CREATE INDEX "AutomationEnrollment_scheduledAt_status_idx" ON "AutomationEnrollment"("scheduledAt", "status");

-- CreateIndex
CREATE INDEX "AutomationEnrollment_tenantId_automationId_idx" ON "AutomationEnrollment"("tenantId", "automationId");

-- CreateIndex
CREATE INDEX "EmailSuppression_tenantId_email_idx" ON "EmailSuppression"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "EmailSuppression_tenantId_email_key" ON "EmailSuppression"("tenantId", "email");

-- CreateIndex
CREATE INDEX "EmailBounceEvent_tenantId_email_idx" ON "EmailBounceEvent"("tenantId", "email");

-- CreateIndex
CREATE INDEX "EmailBounceEvent_createdAt_idx" ON "EmailBounceEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "TenantPolicy" ADD CONSTRAINT "TenantPolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessEntity" ADD CONSTRAINT "BusinessEntity_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_guestAccountId_fkey" FOREIGN KEY ("guestAccountId") REFERENCES "GuestAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_accommodationId_fkey" FOREIGN KEY ("accommodationId") REFERENCES "Accommodation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MagicLink" ADD CONSTRAINT "MagicLink_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantIntegration" ADD CONSTRAINT "TenantIntegration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncJob" ADD CONSTRAINT "SyncJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncEvent" ADD CONSTRAINT "SyncEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantLocale" ADD CONSTRAINT "TenantLocale_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantTranslation" ADD CONSTRAINT "TenantTranslation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantTranslation" ADD CONSTRAINT "TenantTranslation_tenantId_locale_fkey" FOREIGN KEY ("tenantId", "locale") REFERENCES "TenantLocale"("tenantId", "locale") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailTemplate" ADD CONSTRAINT "EmailTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailSendLog" ADD CONSTRAINT "EmailSendLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailUnsubscribe" ADD CONSTRAINT "EmailUnsubscribe_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailDomain" ADD CONSTRAINT "EmailDomain_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MagicLinkToken" ADD CONSTRAINT "MagicLinkToken_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestAccount" ADD CONSTRAINT "GuestAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestOtpCode" ADD CONSTRAINT "GuestOtpCode_guestAccountId_fkey" FOREIGN KEY ("guestAccountId") REFERENCES "GuestAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestTag" ADD CONSTRAINT "GuestTag_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestTag" ADD CONSTRAINT "GuestTag_guestAccountId_fkey" FOREIGN KEY ("guestAccountId") REFERENCES "GuestAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestNote" ADD CONSTRAINT "GuestNote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestNote" ADD CONSTRAINT "GuestNote_guestAccountId_fkey" FOREIGN KEY ("guestAccountId") REFERENCES "GuestAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestAccountEvent" ADD CONSTRAINT "GuestAccountEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestAccountEvent" ADD CONSTRAINT "GuestAccountEvent_guestAccountId_fkey" FOREIGN KEY ("guestAccountId") REFERENCES "GuestAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestAddress" ADD CONSTRAINT "GuestAddress_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestAddress" ADD CONSTRAINT "GuestAddress_guestAccountId_fkey" FOREIGN KEY ("guestAccountId") REFERENCES "GuestAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProductTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMedia" ADD CONSTRAINT "ProductMedia_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOption" ADD CONSTRAINT "ProductOption_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTemplate" ADD CONSTRAINT "ProductTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCollection" ADD CONSTRAINT "ProductCollection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCollectionItem" ADD CONSTRAINT "ProductCollectionItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "ProductCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCollectionItem" ADD CONSTRAINT "ProductCollectionItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Accommodation" ADD CONSTRAINT "Accommodation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccommodationHighlight" ADD CONSTRAINT "AccommodationHighlight_accommodationId_fkey" FOREIGN KEY ("accommodationId") REFERENCES "Accommodation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccommodationUnit" ADD CONSTRAINT "AccommodationUnit_accommodationId_fkey" FOREIGN KEY ("accommodationId") REFERENCES "Accommodation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccommodationFacility" ADD CONSTRAINT "AccommodationFacility_accommodationId_fkey" FOREIGN KEY ("accommodationId") REFERENCES "Accommodation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BedConfiguration" ADD CONSTRAINT "BedConfiguration_accommodationId_fkey" FOREIGN KEY ("accommodationId") REFERENCES "Accommodation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatePlan" ADD CONSTRAINT "RatePlan_accommodationId_fkey" FOREIGN KEY ("accommodationId") REFERENCES "Accommodation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccommodationRestriction" ADD CONSTRAINT "AccommodationRestriction_accommodationId_fkey" FOREIGN KEY ("accommodationId") REFERENCES "Accommodation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccommodationMedia" ADD CONSTRAINT "AccommodationMedia_accommodationId_fkey" FOREIGN KEY ("accommodationId") REFERENCES "Accommodation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccommodationCategory" ADD CONSTRAINT "AccommodationCategory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccommodationCategoryItem" ADD CONSTRAINT "AccommodationCategoryItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "AccommodationCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccommodationCategoryItem" ADD CONSTRAINT "AccommodationCategoryItem_accommodationId_fkey" FOREIGN KEY ("accommodationId") REFERENCES "Accommodation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccommodationCategoryAddon" ADD CONSTRAINT "AccommodationCategoryAddon_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "AccommodationCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccommodationCategoryAddon" ADD CONSTRAINT "AccommodationCategoryAddon_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "ProductCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutSession" ADD CONSTRAINT "CheckoutSession_accommodationId_fkey" FOREIGN KEY ("accommodationId") REFERENCES "Accommodation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTagItem" ADD CONSTRAINT "ProductTagItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTagItem" ADD CONSTRAINT "ProductTagItem_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "ProductTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryChange" ADD CONSTRAINT "InventoryChange_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryChange" ADD CONSTRAINT "InventoryChange_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceChange" ADD CONSTRAINT "PriceChange_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_guestAccountId_fkey" FOREIGN KEY ("guestAccountId") REFERENCES "GuestAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductChannelPublication" ADD CONSTRAINT "ProductChannelPublication_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductChannelPublication" ADD CONSTRAINT "ProductChannelPublication_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLineItem" ADD CONSTRAINT "OrderLineItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Discount" ADD CONSTRAINT "Discount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountCode" ADD CONSTRAINT "DiscountCode_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "Discount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountCondition" ADD CONSTRAINT "DiscountCondition_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "Discount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountProduct" ADD CONSTRAINT "DiscountProduct_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "Discount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountProduct" ADD CONSTRAINT "DiscountProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountCollection" ADD CONSTRAINT "DiscountCollection_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "Discount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountCollection" ADD CONSTRAINT "DiscountCollection_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "ProductCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountSegment" ADD CONSTRAINT "DiscountSegment_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "Discount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountSegment" ADD CONSTRAINT "DiscountSegment_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "GuestSegment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountCustomer" ADD CONSTRAINT "DiscountCustomer_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "Discount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountCustomer" ADD CONSTRAINT "DiscountCustomer_guestAccountId_fkey" FOREIGN KEY ("guestAccountId") REFERENCES "GuestAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountAllocation" ADD CONSTRAINT "DiscountAllocation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountAllocation" ADD CONSTRAINT "DiscountAllocation_orderLineItemId_fkey" FOREIGN KEY ("orderLineItemId") REFERENCES "OrderLineItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountAllocation" ADD CONSTRAINT "DiscountAllocation_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "Discount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountUsage" ADD CONSTRAINT "DiscountUsage_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "Discount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountUsage" ADD CONSTRAINT "DiscountUsage_discountCodeId_fkey" FOREIGN KEY ("discountCodeId") REFERENCES "DiscountCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountUsage" ADD CONSTRAINT "DiscountUsage_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountEvent" ADD CONSTRAINT "DiscountEvent_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "Discount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftCardProduct" ADD CONSTRAINT "GiftCardProduct_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftCardDesign" ADD CONSTRAINT "GiftCardDesign_productId_fkey" FOREIGN KEY ("productId") REFERENCES "GiftCardProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftCard" ADD CONSTRAINT "GiftCard_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftCard" ADD CONSTRAINT "GiftCard_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftCard" ADD CONSTRAINT "GiftCard_designId_fkey" FOREIGN KEY ("designId") REFERENCES "GiftCardDesign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftCardRedemption" ADD CONSTRAINT "GiftCardRedemption_giftCardId_fkey" FOREIGN KEY ("giftCardId") REFERENCES "GiftCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSession" ADD CONSTRAINT "PaymentSession_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSession" ADD CONSTRAINT "PaymentSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantPaymentConfig" ADD CONSTRAINT "TenantPaymentConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantApp" ADD CONSTRAINT "TenantApp_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantAppEvent" ADD CONSTRAINT "TenantAppEvent_tenantId_appId_fkey" FOREIGN KEY ("tenantId", "appId") REFERENCES "TenantApp"("tenantId", "appId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantAppWizard" ADD CONSTRAINT "TenantAppWizard_tenantId_appId_fkey" FOREIGN KEY ("tenantId", "appId") REFERENCES "TenantApp"("tenantId", "appId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantAppHealth" ADD CONSTRAINT "TenantAppHealth_tenantId_appId_fkey" FOREIGN KEY ("tenantId", "appId") REFERENCES "TenantApp"("tenantId", "appId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantAppHealthHistory" ADD CONSTRAINT "TenantAppHealthHistory_tenantId_appId_fkey" FOREIGN KEY ("tenantId", "appId") REFERENCES "TenantApp"("tenantId", "appId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppWebhookDelivery" ADD CONSTRAINT "AppWebhookDelivery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "PlatformEventLog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppWebhookDelivery" ADD CONSTRAINT "AppWebhookDelivery_tenantId_appId_fkey" FOREIGN KEY ("tenantId", "appId") REFERENCES "TenantApp"("tenantId", "appId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantBillingSettings" ADD CONSTRAINT "TenantBillingSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingLineItem" ADD CONSTRAINT "BillingLineItem_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "TenantBillingPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMarketingSync" ADD CONSTRAINT "EmailMarketingSync_tenantId_appId_fkey" FOREIGN KEY ("tenantId", "appId") REFERENCES "TenantApp"("tenantId", "appId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailAttribution" ADD CONSTRAINT "EmailAttribution_tenantId_appId_fkey" FOREIGN KEY ("tenantId", "appId") REFERENCES "TenantApp"("tenantId", "appId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestSegment" ADD CONSTRAINT "GuestSegment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestSegmentMembership" ADD CONSTRAINT "GuestSegmentMembership_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "GuestSegment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestSegmentMembership" ADD CONSTRAINT "GuestSegmentMembership_guestAccountId_fkey" FOREIGN KEY ("guestAccountId") REFERENCES "GuestAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RumEvent" ADD CONSTRAINT "RumEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RumRateLimit" ADD CONSTRAINT "RumRateLimit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RumDailyAggregate" ADD CONSTRAINT "RumDailyAggregate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "AnalyticsLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsDailyMetric" ADD CONSTRAINT "AnalyticsDailyMetric_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpotMap" ADD CONSTRAINT "SpotMap_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpotMap" ADD CONSTRAINT "SpotMap_tenantAppId_fkey" FOREIGN KEY ("tenantAppId") REFERENCES "TenantApp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpotMapAccommodation" ADD CONSTRAINT "SpotMapAccommodation_spotMapId_fkey" FOREIGN KEY ("spotMapId") REFERENCES "SpotMap"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpotMapAccommodation" ADD CONSTRAINT "SpotMapAccommodation_accommodationId_fkey" FOREIGN KEY ("accommodationId") REFERENCES "Accommodation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpotMarker" ADD CONSTRAINT "SpotMarker_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpotMarker" ADD CONSTRAINT "SpotMarker_spotMapId_fkey" FOREIGN KEY ("spotMapId") REFERENCES "SpotMap"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpotMarker" ADD CONSTRAINT "SpotMarker_accommodationId_fkey" FOREIGN KEY ("accommodationId") REFERENCES "Accommodation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpotMarker" ADD CONSTRAINT "SpotMarker_accommodationUnitId_fkey" FOREIGN KEY ("accommodationUnitId") REFERENCES "AccommodationUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingSpotReservation" ADD CONSTRAINT "PendingSpotReservation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailAppInstallation" ADD CONSTRAINT "EmailAppInstallation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailAppTemplate" ADD CONSTRAINT "EmailAppTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailCampaign" ADD CONSTRAINT "EmailCampaign_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailCampaign" ADD CONSTRAINT "EmailCampaign_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EmailAppTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailCampaign" ADD CONSTRAINT "EmailCampaign_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "GuestSegment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "EmailCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "GuestAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailAutomation" ADD CONSTRAINT "EmailAutomation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailAutomationStep" ADD CONSTRAINT "EmailAutomationStep_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "EmailAutomation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailAutomationStep" ADD CONSTRAINT "EmailAutomationStep_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EmailAppTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationEnrollment" ADD CONSTRAINT "AutomationEnrollment_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "EmailAutomation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationEnrollment" ADD CONSTRAINT "AutomationEnrollment_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "GuestAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationEnrollment" ADD CONSTRAINT "AutomationEnrollment_currentStepId_fkey" FOREIGN KEY ("currentStepId") REFERENCES "EmailAutomationStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailSuppression" ADD CONSTRAINT "EmailSuppression_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailCampaignAnalytics" ADD CONSTRAINT "EmailCampaignAnalytics_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "EmailCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailAutomationAnalytics" ADD CONSTRAINT "EmailAutomationAnalytics_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "EmailAutomation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- Partial unique indexes (not expressible in Prisma DSL)
-- ============================================================================

-- SpotMarker: enforce that a given accommodationUnit can only be marked
-- once per spotmap. Multiple markers with accommodationUnitId = NULL are
-- allowed (unit not yet assigned).
CREATE UNIQUE INDEX "SpotMarker_spotMapId_accommodationUnitId_key"
  ON "SpotMarker" ("spotMapId", "accommodationUnitId")
  WHERE "accommodationUnitId" IS NOT NULL;
