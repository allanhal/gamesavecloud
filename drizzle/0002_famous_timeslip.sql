CREATE TABLE "device_slot_state" (
	"device_id" text NOT NULL,
	"slot_id" uuid NOT NULL,
	"synced_version" integer DEFAULT 0 NOT NULL,
	"local_manifest_hash" text,
	"local_file_count" integer,
	"local_size" bigint,
	"local_path" text,
	"scanned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "device_slot_state_device_id_slot_id_pk" PRIMARY KEY("device_id","slot_id")
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "snapshots" ADD COLUMN "manifest_hash" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "device_slot_state" ADD CONSTRAINT "device_slot_state_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_slot_state" ADD CONSTRAINT "device_slot_state_slot_id_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."slots"("id") ON DELETE cascade ON UPDATE no action;