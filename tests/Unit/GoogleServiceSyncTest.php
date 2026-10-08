<?php

namespace Tests\Unit;

use App\Services\GoogleService;
use Tests\TestCase;

class GoogleServiceSyncTest extends TestCase
{
    public function test_resolve_dept_from_code_or_name(): void
    {
        $service = app(GoogleService::class);

        $this->assertEquals('Engineer', $service->resolveDeptFromCodeOrName('ENG'));
        $this->assertEquals('Engineer', $service->resolveDeptFromCodeOrName('engineer'));
        $this->assertEquals('HK', $service->resolveDeptFromCodeOrName('hk'));
        $this->assertEquals('HK', $service->resolveDeptFromCodeOrName('housekeeping'));
        $this->assertEquals('Kitchen', $service->resolveDeptFromCodeOrName('FB'));
        $this->assertEquals('Kitchen', $service->resolveDeptFromCodeOrName('Kitchen'));
        $this->assertEquals('GR', $service->resolveDeptFromCodeOrName('gre'));
        $this->assertEquals('GR', $service->resolveDeptFromCodeOrName('spa'));
        $this->assertEquals('HR', $service->resolveDeptFromCodeOrName('HR'));
        $this->assertEquals('IT', $service->resolveDeptFromCodeOrName('IT'));
        $this->assertEquals('Fasilitas', $service->resolveDeptFromCodeOrName('fasilitas'));
        $this->assertEquals('Fasilitas', $service->resolveDeptFromCodeOrName('SEC'));
        $this->assertEquals('General', $service->resolveDeptFromCodeOrName('unknown_dept_xyz'));
    }
}
