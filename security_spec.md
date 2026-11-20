# Security Specification — ChromaFrame Studio

## 1. Data Invariants
1. **Strict Ownership**: A user (`request.auth.uid`) may only read, list, create, update, or delete their own `/users/{userId}` document and their own subcollections `/users/{userId}/presets/{presetId}` and `/users/{userId}/exports/{exportId}`.
2. **Verified Email Gate**: Every authenticated write requires `request.auth.token.email_verified == true`.
3. **Parent Master Gate**: Subcollection single-document reads/writes (`presets`, `exports`) verify that the parent `/users/{userId}` document exists.
4. **Immutable Ownership & Creation Timestamps**: `uid`, `id`, `ownerId`, and `createdAt` cannot be modified after creation. `createdAt` must equal `request.time` on creation, and `updatedAt` must equal `request.time` on creation and update.
5. **Strict Schema & Bounds**: All string fields enforce `min`/`max` length and regex ID guards (`^[a-zA-Z0-9_\-]+$`); all numeric fields enforce studio bounds (`borderWidth` 2..32, `glowSpread` 0..80, `glowIntensity` 0.1..1.0, `cornerRadius` 0..64, `stageMargin` 16..120, `rotationSpeed` 0..5); `colors` list is strictly 2..6 hex color strings.

## 2. The "Dirty Dozen" Adversarial Payloads (Must All Return PERMISSION_DENIED)
1. **Cross-User Preset Create**: User A attempts to create `/users/userB/presets/p1` with `ownerId: "userB"`.
2. **OwnerId Spoofing**: User A attempts to create `/users/userA/presets/p1` with `ownerId: "userB"`.
3. **Shadow / Ghost Field Injection**: User A attempts to create a `BorderPreset` with an extra key `isAdmin: true` or `tier: "pro"`.
4. **Unverified Email Write**: User A with `email_verified: false` attempts to write `/users/userA`.
5. **1MB Resource Poisoning ID**: User A attempts to write `/users/userA/presets/${'a'.repeat(500)}`.
6. **Oversized Colors Array**: User A attempts to create a `BorderPreset` with 50 elements in `colors`.
7. **Invalid Type in Colors Array**: User A attempts to create a `BorderPreset` with `colors: [123, 456]`.
8. **Out-of-Bounds Geometry**: User A attempts to set `borderWidth: 9999` or `rotationSpeed: -5`.
9. **Client-Forged Timestamp**: User A attempts to create a `BorderPreset` with `createdAt: new Date('2020-01-01')` instead of `serverTimestamp()`.
10. **Immutable Field Mutation**: User A attempts to update `ownerId` or `createdAt` on an existing `BorderPreset`.
11. **Invalid Enum Aspect Ratio**: User A attempts to set `aspectRatio: "99:1"` on a preset or export record.
12. **Blanket User List Scraping**: User A attempts to `list` `/users` or `/users/userB/presets`.
