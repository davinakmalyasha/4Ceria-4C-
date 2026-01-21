<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Spatie\Permission\Traits\HasRoles;
use App\Models\Arsitek;


class User extends Authenticatable
{
    
    use HasRoles;
    /** @use HasFactory<\Database\Factories\UserFactory> */
    use HasFactory, Notifiable, HasRoles;

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
    ];

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

    public function house(){
        return $this->hasMany(House::class);
    }
    public function phoneNumber(){
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


}
