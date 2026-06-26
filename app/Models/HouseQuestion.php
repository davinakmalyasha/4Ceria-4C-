<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class HouseQuestion extends Model
{
    protected $table = 'house_questions';

    protected $fillable = ['house_id', 'user_id', 'question'];

    public function house()
    {
        return $this->belongsTo(House::class, 'house_id');
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function answers()
    {
        return $this->hasMany(HouseAnswer::class, 'question_id');
    }
}
