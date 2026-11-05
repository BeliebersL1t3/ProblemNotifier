<?php

namespace Tests\Unit;

use App\Services\TelunasGeofenceService;
use PHPUnit\Framework\TestCase;

class TelunasGeofenceServiceTest extends TestCase
{
    public function test_snaps_to_nearest_tpi_facility_accurately()
    {
        // Coordinate right near TPI Restaurant & Office (#2: 0.810600, 103.714100)
        $lat = 0.810610;
        $lng = 103.714115;

        $match = TelunasGeofenceService::findNearestFacility($lat, $lng);

        $this->assertEquals('TPI', $match['resort']);
        $this->assertEquals(2, $match['facility_num']);
        $this->assertEquals('Restoran & Kantor', $match['facility_name']);
        $this->assertEquals('restaurant_office', $match['zone_id']);
        $this->assertLessThan(10, $match['distance_meters']);
        $this->assertTrue($match['is_within_resort']);
        $this->assertStringContainsString('TPI - #2 Restoran & Kantor', $match['formatted_location']);
        $this->assertStringContainsString('https://maps.google.com/?q=', $match['formatted_location']);
    }

    public function test_snaps_to_nearest_tbr_facility_accurately()
    {
        // Coordinate near TBR Dining Room (#1: 0.815400, 103.712600)
        $lat = 0.815390;
        $lng = 103.712610;

        $match = TelunasGeofenceService::findNearestFacility($lat, $lng);

        $this->assertEquals('TBR', $match['resort']);
        $this->assertEquals(1, $match['facility_num']);
        $this->assertEquals('Dining Room', $match['facility_name']);
        $this->assertEquals('tbr_dining', $match['zone_id']);
        $this->assertLessThan(10, $match['distance_meters']);
        $this->assertTrue($match['is_within_resort']);
        $this->assertStringContainsString('TBR - #1 Dining Room', $match['formatted_location']);
    }

    public function test_identifies_batam_office_for_distant_coordinates()
    {
        // Coordinate in Batam / Sekupang (1.125100, 103.935200)
        $lat = 1.125100;
        $lng = 103.935200;

        $match = TelunasGeofenceService::findNearestFacility($lat, $lng);

        $this->assertEquals('OFFICE', $match['resort']);
        $this->assertEquals('kantor_sekupang', $match['zone_id']);
        $this->assertStringContainsString('Kantor Sekupang', $match['formatted_location']);
    }
}
