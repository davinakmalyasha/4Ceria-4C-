<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\HasApiTokens;
use Spatie\Permission\Traits\HasRoles;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, HasRoles, Notifiable;

    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     */
    protected $table = 'users';

    protected $fillable = [
        'name',
        'username',
        'email',
        'password',
        'role_type',
        'unique_code',
    ];

    protected static function booted(): void
    {
        static::creating(function (User $user): void {
            if (empty($user->unique_code)) {
                $user->unique_code = self::generateUniqueCode();
            }
        });
    }

    public static function generateUniqueCode(): string
    {
        $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        do {
            $code = '';
            for ($i = 0; $i < 6; $i++) {
                $code .= $chars[random_int(0, strlen($chars) - 1)];
            }
        } while (DB::table('users')->where('unique_code', $code)->exists());

        return $code;
    }

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var array<int, string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    public function house()
    {
        return $this->hasMany(House::class);
    }

    public function phoneNumber()
    {
        return $this->hasMany(PhoneNumber::class, 'id_user');
    }

    public function arsitek()
    {
        return $this->hasOne(Arsitek::class, 'user_id', 'id');
    }

    public function kontraktor()
    {
        return $this->hasOne(Kontraktor::class, 'user_id');
    }

    public function admin()
    {
        return $this->hasOne(Admin::class);
    }

    public function supplier()
    {
        return $this->hasOne(Supplier::class, 'user_id');
    }

    public function conversations()
    {
        return Conversation::where('user_one_id', $this->id)
            ->orWhere('user_two_id', $this->id);
    }

    public function chatMessages()
    {
        return $this->hasMany(ChatMessage::class, 'sender_id');
    }

    public function courierProfile()
    {
        return $this->hasOne(CourierProfile::class, 'user_id');
    }

    public function notaris_profile()
    {
        return $this->hasOne(NotarisProfile::class, 'user_id');
    }

    public function interior_profile()
    {
        return $this->hasOne(InteriorProfile::class, 'user_id');
    }

    public function project_manager()
    {
        return $this->hasOne(ProjectManager::class, 'user_id');
    }

    public function structural_engineer()
    {
        return $this->hasOne(StructuralEngineer::class, 'user_id');
    }

    public function mep_engineer()
    {
        return $this->hasOne(MepEngineer::class, 'user_id');
    }

    public function teamMembers()
    {
        return $this->hasMany(TeamMember::class, 'owner_user_id');
    }

    /** Firm members I own (as Architect/Contractor) */
    public function firmRoster()
    {
        return $this->hasMany(FirmMember::class, 'firm_owner_id');
    }

    /** Firms I belong to (as specialist) */
    public function firmMemberships()
    {
        return $this->hasMany(FirmMember::class, 'member_user_id');
    }
}
