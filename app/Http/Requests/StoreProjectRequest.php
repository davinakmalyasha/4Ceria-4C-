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
            'budget' => 'required|numeric|min:0',
            'lokasi' => 'required|string|max:255',
            'latitude' => 'nullable|string',
            'longitude' => 'nullable|string',
            'province' => 'nullable|string',
            'city' => 'nullable|string',
            'kecamatan' => 'nullable|string',
            'kelurahan' => 'nullable|string',
            'postal_code' => 'nullable|string',
            'street_name' => 'nullable|string',
            'jenis_proyek' => 'nullable|string',
            'project_category' => 'required|string|in:new_build,renovation,interior,maintenance',
            'project_dimensions' => 'nullable|json',
            'target_role' => 'sometimes|nullable|string|in:both,arsitek,kontraktor,interior',
            'deadline' => 'required|date',
            'attachment' => 'nullable|file|mimes:pdf,doc,docx,xls,xlsx,jpg,jpeg,png,webp,zip|max:10240',
            'images' => 'nullable|array|max:3',
            'images.*' => 'mimes:jpg,jpeg,png,webp|max:5120',
            'wants_project_manager' => 'nullable|boolean',
            'needed_phases' => 'nullable|string', // JSON array of design,build,interior,legal
            'legal_detail' => 'nullable|string',
            'wants_to_discuss_later' => 'nullable|boolean',
            'external_vendors' => 'nullable|json',
            'bidding_choices' => 'nullable|json',
        ];
    }
}
