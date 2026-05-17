<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateHouseRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => 'sometimes|string|max:255',
            'price' => 'sometimes|numeric|min:0',
            'house_desc' => 'sometimes|string',
            'width' => 'sometimes|numeric|max_digits:4|min:0',
            'length' => 'sometimes|numeric|max_digits:4|min:0',
            'ba' => 'sometimes|numeric|max_digits:2|min:0',
            'br' => 'sometimes|numeric|max_digits:2|min:0',
            'floors' => 'sometimes|numeric|max_digits:2|min:1',
            'street_name' => 'sometimes|string|max:255',
            'kelurahan' => 'sometimes|string|max:255',
            'kecamatan' => 'sometimes|string|max:255',
            'kab_kota' => 'sometimes|string|max:255',
            'province' => 'sometimes|string|max:255',
            'postal_code' => 'sometimes|numeric',
            'lat' => 'sometimes|numeric',
            'lng' => 'sometimes|numeric',
            'rooms' => 'nullable|array',
            'rooms.*.id' => 'nullable|numeric|exists:rooms,id',
            'rooms.*.name' => 'required_with:rooms|string|max:255',
            'rooms.*.type' => 'required_with:rooms|string|in:room,bedroom,bathroom,others',
            'rooms.*.width' => 'required_with:rooms|numeric|min:0',
            'rooms.*.length' => 'required_with:rooms|numeric|min:0',
            'rooms.*.desc' => 'nullable|string',
            'rooms.*.pics' => 'nullable|array',
            'rooms.*.pics.*' => 'image|mimes:jpeg,png,jpg|max:2048',
            'house_pics' => 'nullable|array',
            'house_pics.*' => 'image|mimes:jpeg,png,jpg|max:2048',
            'deleted_house_pics' => 'nullable|array',
            'deleted_house_pics.*' => 'numeric|exists:house_pic,id',
        ];
    }
}
