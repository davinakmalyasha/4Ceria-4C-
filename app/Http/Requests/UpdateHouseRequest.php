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
            'lng' => 'sometimes|numeric'
        ];
    }
}
