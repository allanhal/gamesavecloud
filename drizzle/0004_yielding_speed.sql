DROP INDEX "releases_version_arch_idx";--> statement-breakpoint
ALTER TABLE "releases" ADD COLUMN "kind" text DEFAULT 'installer' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "releases_version_arch_kind_idx" ON "releases" USING btree ("version","platform","arch","kind");