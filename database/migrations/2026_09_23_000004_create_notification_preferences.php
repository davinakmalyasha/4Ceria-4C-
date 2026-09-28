<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Per-user notification preferences + reachable channels.
     *
     * WHY: Web Push shipped in 2026-09 and `AppServiceProvider` fans EVERY
     * Notification out to the user's push subscriptions from a single
     * `Notification::created` hook. Without a preference layer, a user cannot
     * mute anything, and 48 create sites would each need their own guard — the
     * hook is the only sane enforcement point.
     *
     * `type` NULL means "applies to every type", so a user can set a blanket
     * default and then override individual types.
     */
    public function up(): void
    {
        if (Schema::hasTable('notification_preferences')) {
            return;
        }

        Schema::create('notification_preferences', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('type', 60)->nullable();
            $table->string('channel', 20); // inapp | webpush | email | whatsapp
            $table->boolean('enabled')->default(true);
            $table->time('quiet_hours_start')->nullable();
            $table->time('quiet_hours_end')->nullable();
            $table->string('digest', 10)->default('none'); // none | daily | weekly
            $table->timestamps();

            $table->unique(['user_id', 'type', 'channel'], 'notification_prefs_unique');
            $table->index(['user_id', 'channel']);
        });

        // Where a channel actually points (email address, phone for WhatsApp).
        Schema::create('user_channels', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('channel', 20);
            $table->string('destination')->nullable();
            $table->timestamp('verified_at')->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'channel'], 'user_channels_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_channels');
        Schema::dropIfExists('notification_preferences');
    }
};
