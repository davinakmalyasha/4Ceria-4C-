<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;

/**
 * Mints a Sanctum token for the visual-baseline harness.
 *
 * WHY A COMMAND AND NOT THE LOGIN FORM
 * ------------------------------------
 * Driving the login form would put the login screen's own rendering between
 * the harness and the screen it is trying to photograph, and would make the
 * whole baseline depend on a password the fixture happens to have. A token
 * goes straight to the state under test.
 *
 * WHY IT REFUSES OUTSIDE local/testing
 * ------------------------------------
 * It creates a working credential for an arbitrary account. That is useful
 * on a developer's machine and catastrophic in production, so the check is
 * the first thing in the method rather than a comment asking nicely.
 *
 * The token is named after the harness, so `personal_access_tokens` shows
 * exactly what created it and the rows can be pruned without guesswork.
 */
class VisualTokenCommand extends Command
{
    protected $signature = 'visual:token
        {--email= : The user to mint a token for}
        {--role= : …or the first user with this role_type}
        {--delete : Delete the harness tokens instead of minting one}';

    protected $description = 'Mint a Sanctum token for the visual-baseline harness (local only)';

    public function handle(): int
    {
        if (! app()->environment(['local', 'testing'])) {
            $this->error('visual:token refuses to run outside local/testing.');

            return self::FAILURE;
        }

        if ($this->option('delete')) {
            $deleted = \Laravel\Sanctum\PersonalAccessToken::query()
                ->where('name', 'visual-baseline')
                ->delete();

            $this->info("Deleted {$deleted} visual-baseline token(s).");

            return self::SUCCESS;
        }

        $user = $this->resolveUser();

        if ($user === null) {
            return self::FAILURE;
        }

        $token = $user->createToken('visual-baseline')->plainTextToken;

        // JSON on stdout so the harness parses one document rather than
        // scraping a table. Nothing else is written to stdout on this path.
        $this->line((string) json_encode([
            'token' => $token,
            'user' => [
                'id' => $user->id,
                'email' => $user->email,
                'role_type' => $user->role_type,
            ],
        ], JSON_UNESCAPED_SLASHES));

        return self::SUCCESS;
    }

    private function resolveUser(): ?User
    {
        $email = $this->option('email');
        $role = $this->option('role');

        if (is_string($email) && $email !== '') {
            $user = User::query()->where('email', $email)->first();

            if ($user === null) {
                $this->error("No user with email {$email}.");

                return null;
            }

            return $user;
        }

        if (is_string($role) && $role !== '') {
            $user = User::query()->where('role_type', $role)->orderBy('id')->first();

            if ($user === null) {
                $this->error("No user with role_type {$role} — the seed does not carry one.");

                return null;
            }

            return $user;
        }

        $this->error('Pass --email=… or --role=…');

        return null;
    }
}
