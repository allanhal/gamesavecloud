CREATE TABLE "releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" text NOT NULL,
	"platform" text DEFAULT 'win' NOT NULL,
	"arch" text NOT NULL,
	"filename" text NOT NULL,
	"key" text NOT NULL,
	"size" bigint NOT NULL,
	"sha256" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "releases_version_arch_idx" ON "releases" USING btree ("version","platform","arch");