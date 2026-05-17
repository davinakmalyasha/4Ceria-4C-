<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreHouseRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => 'required|string|max:255',
            'price' => 'required|numeric|min:0',
            'house_desc' => 'required|string',
            'width' => 'required|numeric|max_digits:4|min:0',
            'length' => 'required|numeric|max_digits:4|min:0',
            'ba' => 'required|numeric|max_digits:2|min:0',
            'br' => 'required|numeric|max_digits:2|min:0',
            'floors' => 'required|numeric|max_digits:2|min:1',
            'street_name' => 'required|string|max:255',
            'kelurahan' => 'required|string|max:255',
            'kecamatan' => 'required|string|max:255',
            'kab_kota' => 'required|string|max:255',
            'province' => 'required|string|max:255',
            'postal_code' => 'required|numeric',
            'lat' => 'required|numeric',
            'lng' => 'required|numeric',
            'house_pic' => 'nullable|array',
            'house_pic.*' => 'image|mimes:jpeg,png,jpg|max:2048',
            'rooms' => 'nullable|array',
            'rooms.*.name' => 'required|string|max:255',
            'rooms.*.type' => 'required|string|in:room,bedroom,bathroom,others',
            'rooms.*.width' => 'required|numeric|min:0',
            'rooms.*.length' => 'required|numeric|min:0',
            'rooms.*.desc' => 'nullable|string',
            'rooms.*.pics' => 'nullable|array',
            'rooms.*.pics.*' => 'image|mimes:jpeg,png,jpg|max:2048',
        ];
    }
}
