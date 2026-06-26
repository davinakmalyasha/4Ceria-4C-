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
            'coordinate' => $this->coordinate,
            'user_id' => $this->id_user,
            'views' => $this->views,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
            'housePic' => $this->whenLoaded('housePic', fn () => $this->housePic->values()),
            'owner' => $this->whenLoaded('user', fn () => [
                'id' => $this->user->id,
                'name' => $this->user->name,
                'email' => $this->user->email,
                'phones' => $this->user->phoneNumber->pluck('contact')->toArray(),
                'role_type' => $this->user->role_type,
            ]),
            'roomList' => $this->whenLoaded('room', fn () => $this->room->values()->map(fn ($r) => [
                'id' => $r->id,
                'name' => $r->name,
                'type' => $r->type,
                'width' => $r->width,
                'length' => $r->length,
                'description' => $r->desc,
                'pics' => $r->roomPic->values()->map(fn ($p) => ['id' => $p->id, 'dir' => $p->dir]),
            ])),
        ];
    }
}
