<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class HouseResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'price' => $this->price,
            'description' => $this->house_desc,
            'dimensions' => [
                'width' => $this->width,
                'length' => $this->length,
                'floors' => $this->floors,
            ],
            'rooms' => [
                'bedrooms' => $this->br,
                'bathrooms' => $this->ba,
            ],
            'address' => [
                'street' => $this->street_name,
                'kelurahan' => $this->kelurahan,
                'kecamatan' => $this->kecamatan,
                'city' => $this->kab_kota,
                'province' => $this->province,
                'postal_code' => $this->postal_code,
                'coordinates' => $this->coordinate,
            ],
            'user_id' => $this->id_user,
            'views' => $this->views,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
            'housePic' => $this->whenLoaded('housePic'),
        ];
    }
}
