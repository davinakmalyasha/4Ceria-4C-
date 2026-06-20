<?php

$patches = [
    'vendor/laravel/octane/src/Commands/Concerns/InteractsWithServers.php' => [
        'target' => "    public function getSubscribedSignals(): array\n    {\n        return [SIGINT, SIGTERM, SIGHUP];\n    }",
        'replace' => "    public function getSubscribedSignals(): array\n    {\n        return extension_loaded('pcntl') ? [SIGINT, SIGTERM, SIGHUP] : [];\n    }"
    ],
    'vendor/laravel/octane/src/Commands/StartFrankenPhpCommand.php' => [
        'target' => "            'APP_ENV' => app()->environment(),\n            'APP_BASE_PATH' => base_path(),\n            'APP_PUBLIC_PATH' => public_path(),\n            'LARAVEL_OCTANE' => 1,",
        'replace' => "            'APP_ENV' => app()->environment(),\n            'APP_BASE_PATH' => base_path(),\n            'APP_PUBLIC_PATH' => public_path(),\n            'PHPRC' => dirname(PHP_BINARY),\n            'LARAVEL_OCTANE' => 1,"
    ],
    'vendor/laravel/octane/src/FrankenPHP/Concerns/FindsFrankenPhpBinary.php' => [
        'target' => "    protected function findFrankenPhpBinary(): ?string\n    {\n        return (new ExecutableFinder())->find('frankenphp', null, [base_path()]);\n    }",
        'replace' => "    protected function findFrankenPhpBinary(): ?string\n    {\n        \$home = \$_SERVER['USERPROFILE'] ?? \$_SERVER['HOME'] ?? '';\n        \$dirs = [base_path()];\n        if (\$home) {\n            \$dirs[] = rtrim(\$home, '\\\\/') . '/.frankenphp';\n        }\n        return (new ExecutableFinder())->find('frankenphp', null, \$dirs);\n    }"
    ]
];

foreach ($patches as $filePath => $patch) {
    if (!file_exists($filePath)) {
        echo "File not found: $filePath. Skipping patch.\n";
        continue;
    }

    $content = file_get_contents($filePath);
    if (strpos($content, $patch['replace']) !== false) {
        echo "File already patched: $filePath\n";
        continue;
    }

    if (strpos($content, $patch['target']) !== false) {
        $content = str_replace($patch['target'], $patch['replace'], $content);
        file_put_contents($filePath, $content);
        echo "Successfully patched: $filePath\n";
    } else {
        echo "Target code block not found in $filePath. Cannot apply patch.\n";
    }
}
