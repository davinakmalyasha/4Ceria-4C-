<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreProjectRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, \Illuminate\Contracts\Validation\ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'title' => 'required|string|max:255',
            'description' => 'required|string',
            'budget' => 'required|numeric',
            'lokasi' => 'required|string|max:255',
            'latitude' => 'nullable|string',
            'longitude' => 'nullable|string',
            'province' => 'nullable|string',
            'city' => 'nullable|string',
            'kecamatan' => 'nullable|string',
            'kelurahan' => 'nullable|string',
            'postal_code' => 'nullable|string',
            'street_name' => 'nullable|string',
            'jenis_proyek' => 'required|string',
            'target_role' => 'required|string|in:both,arsitek,kontraktor',
            'deadline' => 'required|date',
            'attachment' => 'nullable|file|max:10240',
            'images' => 'nullable|array|max:3',
            'images.*' => 'image|max:5120',
        ];
    }
}
