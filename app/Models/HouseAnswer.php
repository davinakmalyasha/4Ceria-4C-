<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class HouseAnswer extends Model
{
    protected $table = 'house_answers';

    protected $fillable = ['question_id', 'user_id', 'answer'];

    public function question()
    {
        return $this->belongsTo(HouseQuestion::class, 'question_id');
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
