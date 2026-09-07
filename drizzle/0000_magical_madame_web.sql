CREATE TYPE "public"."image_kind" AS ENUM('main', 'front', 'side', 'inside', 'back', 'other');--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "car_availability_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"car_id" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "car_availability_blocks_end_after_start" CHECK ("car_availability_blocks"."end_date" > "car_availability_blocks"."start_date")
);
--> statement-breakpoint
CREATE TABLE "car_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"car_id" text NOT NULL,
	"public_id" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"blur_data_url" text,
	"kind" "image_kind" DEFAULT 'other' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"alt" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cars" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"car_type" text,
	"seating" integer,
	"fuel" text,
	"transmission" text,
	"year" integer,
	"description" text,
	"price_per_day" integer DEFAULT 0 NOT NULL,
	"driver_price_per_day" integer,
	"km_limit_per_day" integer,
	"extra_km_charge" integer,
	"self_drive" boolean DEFAULT true NOT NULL,
	"with_driver" boolean DEFAULT true NOT NULL,
	"availability" boolean DEFAULT true NOT NULL,
	"delivery_available" boolean DEFAULT false NOT NULL,
	"location_id" text,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" text PRIMARY KEY NOT NULL,
	"city" text NOT NULL,
	"office_name" text,
	"address_short" text NOT NULL,
	"address_full" text,
	"directions_url" text,
	"whatsapp_phone" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY NOT NULL,
	"whatsapp_phone" text NOT NULL,
	"pickup_address" text NOT NULL,
	"default_driver_price_per_day" integer DEFAULT 1000 NOT NULL,
	"default_km_limit_per_day" integer DEFAULT 100 NOT NULL,
	"default_extra_km_charge" integer DEFAULT 50 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_single_row" CHECK ("settings"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "car_availability_blocks" ADD CONSTRAINT "car_availability_blocks_car_id_cars_id_fk" FOREIGN KEY ("car_id") REFERENCES "public"."cars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "car_images" ADD CONSTRAINT "car_images_car_id_cars_id_fk" FOREIGN KEY ("car_id") REFERENCES "public"."cars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cars" ADD CONSTRAINT "cars_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "car_availability_blocks_car_id_start_idx" ON "car_availability_blocks" USING btree ("car_id","start_date");--> statement-breakpoint
CREATE INDEX "car_images_car_id_idx" ON "car_images" USING btree ("car_id");--> statement-breakpoint
CREATE UNIQUE INDEX "car_images_car_id_sort_order_uq" ON "car_images" USING btree ("car_id","sort_order");--> statement-breakpoint
CREATE INDEX "cars_sort_order_idx" ON "cars" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "cars_location_id_idx" ON "cars" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "locations_sort_order_idx" ON "locations" USING btree ("sort_order");