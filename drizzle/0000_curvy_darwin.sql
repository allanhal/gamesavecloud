CREATE TABLE "blobs" (
	"hash" text PRIMARY KEY NOT NULL,
	"size" bigint NOT NULL,
	"compressed_size" bigint,
	"ref_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unreferenced_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"slot" integer DEFAULT 0 NOT NULL,
	"current_version" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "snapshot_files" (
	"snapshot_id" uuid NOT NULL,
	"path" text NOT NULL,
	"blob_hash" text NOT NULL,
	"size" bigint NOT NULL,
	CONSTRAINT "snapshot_files_snapshot_id_path_pk" PRIMARY KEY("snapshot_id","path")
);
--> statement-breakpoint
CREATE TABLE "snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slot_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"device" text,
	"playtime_seconds" integer,
	"total_size" bigint NOT NULL,
	"file_count" integer NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "slots" ADD CONSTRAINT "slots_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshot_files" ADD CONSTRAINT "snapshot_files_snapshot_id_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshot_files" ADD CONSTRAINT "snapshot_files_blob_hash_blobs_hash_fk" FOREIGN KEY ("blob_hash") REFERENCES "public"."blobs"("hash") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_slot_id_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blobs_unreferenced_idx" ON "blobs" USING btree ("unreferenced_at");--> statement-breakpoint
CREATE UNIQUE INDEX "games_slug_idx" ON "games" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "slots_game_slot_idx" ON "slots" USING btree ("game_id","slot");--> statement-breakpoint
CREATE INDEX "snapshot_files_blob_idx" ON "snapshot_files" USING btree ("blob_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "snapshots_slot_version_idx" ON "snapshots" USING btree ("slot_id","version");