<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('unique_code', 6)->nullable()->unique()->after('username');
        });

        // Backfill existing users with random 6-char alphanumeric codes
        $users = DB::table('users')->whereNull('unique_code')->get();
        foreach ($users as $user) {
            $code = $this->generateCode();
            DB::table('users')->where('id', $user->id)->update(['unique_code' => $code]);
        }
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('unique_code');
        });
    }

    private function generateCode(): string
    {
        $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I/O/0/1 to avoid confusion
        do {
            $code = '';
            for ($i = 0; $i < 6; $i++) {
                $code .= $chars[random_int(0, strlen($chars) - 1)];
            }
        } while (DB::table('users')->where('unique_code', $code)->exists());

        return $code;
    }
};
