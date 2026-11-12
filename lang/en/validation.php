<?php

return [
    'email'    => 'The :attribute field must be a valid email address.',
    'required' => 'The :attribute field is required.',
    'string'   => 'The :attribute field must be a string.',
    'image'    => 'The :attribute field must be a valid image.',
    'date'     => 'The :attribute field must be a valid date.',
    'array'    => 'The :attribute field must be a list.',
    'max'      => [
        'array'   => 'The :attribute field must not have more than :max items.',
        'file'    => 'The :attribute field must not be greater than :max kilobytes.',
        'numeric' => 'The :attribute field must not be greater than :max.',
        'string'  => 'The :attribute field must not be greater than :max characters.',
    ],
    'min'      => [
        'array'   => 'Please select at least :min item(s) for :attribute.',
        'file'    => 'The :attribute field must be at least :min kilobytes.',
        'numeric' => 'The :attribute field must be at least :min.',
        'string'  => 'The :attribute field must be at least :min characters.',
    ],
    'regex'    => 'The :attribute format is invalid.',
    'attributes' => [
        'email'         => 'email',
        'password'      => 'password',
        'otp'           => 'OTP code',
        'location'      => 'location',
        'title'         => 'issue title',
        'description'   => 'description',
        'reporter_name' => 'reporter name',
        'reason'        => 'reason',
        'note'          => 'resolution note',
        'to_department' => 'target department',
        'workers'                 => 'workers',
        'image'                   => 'photo attachment',
        'proof_image'             => 'proof image',
        'estimated_completion_at' => 'estimated completion time',
    ],
];

