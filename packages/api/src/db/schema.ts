import { relations, sql } from 'drizzle-orm';
import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  index,
  uuid,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const authCodes = pgTable(
  'auth_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    code: text('code').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    activeCodeIdx: uniqueIndex('auth_codes_code_active')
      .on(t.code)
      .where(sql`${t.usedAt} IS NULL`),
    cleanupIdx: index('auth_codes_cleanup').on(t.expiresAt),
    emailIdx: index('auth_codes_email').on(t.email, t.createdAt),
  }),
);

export const devices = pgTable('devices', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  hostname: text('hostname').notNull(),
  os: text('os').notNull(), // darwin | linux
  arch: text('arch').notNull(), // arm64 | x64
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});

export const skills = pgTable(
  'skills',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userNameIdx: uniqueIndex('skills_user_name').on(t.userId, t.name),
  }),
);

export const skillVersions = pgTable(
  'skill_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    hash: text('hash').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    r2Key: text('r2_key').notNull(),
    yankedAt: timestamp('yanked_at', { withTimezone: true }),
    yankReason: text('yank_reason'),
    pushedByDevice: uuid('pushed_by_device').references(() => devices.id, {
      onDelete: 'set null',
    }),
    pushedAt: timestamp('pushed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    skillVersionIdx: uniqueIndex('skill_versions_skill_version').on(
      t.skillId,
      t.version,
    ),
    byVersionIdx: index('skill_versions_skill_desc').on(t.skillId, t.version),
  }),
);

export const installations = pgTable(
  'installations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    scope: text('scope').notNull(), // 'global' | 'project'
    projectPath: text('project_path'),
    installedAt: timestamp('installed_at', { withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp('removed_at', { withTimezone: true }),
  },
  (t) => ({
    activeByDeviceIdx: index('installations_device_active')
      .on(t.deviceId)
      .where(sql`${t.removedAt} IS NULL`),
  }),
);

export const usagePings = pgTable(
  'usage_pings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    version: integer('version'),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    projectPath: text('project_path'),
    pingedAt: timestamp('pinged_at', { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb('metadata'),
  },
  (t) => ({
    skillPingedIdx: index('usage_pings_skill_pinged').on(t.skillId, t.pingedAt),
    deviceIdx: index('usage_pings_device').on(t.deviceId),
    dedupeIdx: index('usage_pings_dedupe').on(t.skillId, t.deviceId, t.pingedAt),
  }),
);

// Relations (used by Drizzle query builder)

export const usersRelations = relations(users, ({ many }) => ({
  devices: many(devices),
  skills: many(skills),
}));

export const devicesRelations = relations(devices, ({ one, many }) => ({
  user: one(users, { fields: [devices.userId], references: [users.id] }),
  installations: many(installations),
}));

export const skillsRelations = relations(skills, ({ one, many }) => ({
  user: one(users, { fields: [skills.userId], references: [users.id] }),
  versions: many(skillVersions),
}));

export const skillVersionsRelations = relations(skillVersions, ({ one }) => ({
  skill: one(skills, { fields: [skillVersions.skillId], references: [skills.id] }),
}));

export const installationsRelations = relations(installations, ({ one }) => ({
  skill: one(skills, { fields: [installations.skillId], references: [skills.id] }),
  device: one(devices, { fields: [installations.deviceId], references: [devices.id] }),
}));

export const usagePingsRelations = relations(usagePings, ({ one }) => ({
  skill: one(skills, { fields: [usagePings.skillId], references: [skills.id] }),
  device: one(devices, { fields: [usagePings.deviceId], references: [devices.id] }),
}));
