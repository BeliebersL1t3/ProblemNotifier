<?php

return [
    'email'    => 'Format alamat :attribute tidak valid.',
    'required' => 'Kolom :attribute wajib diisi.',
    'string'   => 'Kolom :attribute harus berupa teks.',
    'image'    => 'File :attribute harus berupa gambar yang valid.',
    'date'     => 'Format tanggal :attribute tidak valid.',
    'array'    => 'Kolom :attribute harus berupa daftar pilihan.',
    'max'      => [
        'array'   => 'Kolom :attribute tidak boleh lebih dari :max item.',
        'file'    => 'Ukuran :attribute maksimal :max kilobita.',
        'numeric' => 'Nilai :attribute maksimal :max.',
        'string'  => 'Teks :attribute maksimal :max karakter.',
    ],
    'min'      => [
        'array'   => 'Pilih minimal :min item untuk :attribute.',
        'file'    => 'Ukuran :attribute minimal :min kilobita.',
        'numeric' => 'Nilai :attribute minimal :min.',
        'string'  => 'Teks :attribute minimal :min karakter.',
    ],
    'regex'    => 'Format :attribute tidak sesuai.',
    'attributes' => [
        'email'         => 'email',
        'password'      => 'kata sandi',
        'otp'           => 'kode OTP',
        'location'      => 'lokasi',
        'title'         => 'judul masalah',
        'description'   => 'deskripsi',
        'reporter_name' => 'nama pelapor',
        'reason'        => 'alasan',
        'note'          => 'catatan penyelesaian',
        'to_department' => 'departemen tujuan',
        'workers'                 => 'pekerja',
        'image'                   => 'foto bukti',
        'proof_image'             => 'foto bukti',
        'estimated_completion_at' => 'perkiraan waktu selesai',
    ],
];

