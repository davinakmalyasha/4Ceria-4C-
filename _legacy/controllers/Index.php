<?php

namespace App\Http\Controllers;

use App\Models\House;

class Index extends Controller
{
    public function index()
    {
        $flashMessage = session('flash_message');
        if ($flashMessage) {
            session()->forget('flash_message');
        }

        // $houses = House::orderBy('harga', 'desc')->limit(3)->get();
        $houses = House::with(['housePic' => function ($query) {
            $query->limit(1);
        }])->get();

        // dd($houses->house_pic->file_name);
        // return $houses;
        return view('users-page.index.index', compact('flashMessage', 'houses'));
    }
}
