<?php
/**
 * Plugin Name: ImageAutomator REST API Support
 * Description: Exposes PixProof Proof Galleries and Novo Portfolio to the WordPress REST API for ImageAutomator integration.
 * Version: 1.0.0
 * Author: ImageAutomator
 *
 * Installation: Copy this file to wp-content/mu-plugins/imageautomator-rest.php
 * (Create the mu-plugins folder if it doesn't exist)
 */

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Enable REST API for PixProof proof_gallery and Novo pt-portfolio CPTs
 */
add_filter('register_post_type_args', function ($args, $post_type) {
    // PixProof Proof Gallery
    if ($post_type === 'proof_gallery') {
        $args['show_in_rest'] = true;
        $args['rest_base'] = 'proof-galleries';
    }

    // Novo Portfolio
    if ($post_type === 'pt-portfolio') {
        $args['show_in_rest'] = true;
        $args['rest_base'] = 'portfolio';
    }

    return $args;
}, 25, 2);

/**
 * Register PixProof meta fields for REST API access
 */
add_action('init', function () {
    $pixproof_meta = [
        '_pixproof_main_gallery' => [
            'type' => 'string',
            'description' => 'Comma-separated attachment IDs for the proof gallery',
            'single' => true,
            'default' => '',
        ],
        '_pixproof_client_name' => [
            'type' => 'string',
            'description' => 'Client name for the proof gallery',
            'single' => true,
            'default' => '',
        ],
        '_pixproof_event_date' => [
            'type' => 'string',
            'description' => 'Event date for the proof gallery',
            'single' => true,
            'default' => '',
        ],
        '_pixproof_photo_display_name' => [
            'type' => 'string',
            'description' => 'Photo display name format (unique_ids, consecutive_ids, file_name, etc.)',
            'single' => true,
            'default' => 'unique_ids',
        ],
        '_pixproof_disable_archive_download' => [
            'type' => 'string',
            'description' => 'Disable archive download for this gallery (on/off)',
            'single' => true,
            'default' => '',
        ],
    ];

    foreach ($pixproof_meta as $meta_key => $meta_args) {
        register_post_meta('proof_gallery', $meta_key, [
            'show_in_rest' => true,
            'type' => $meta_args['type'],
            'description' => $meta_args['description'],
            'single' => $meta_args['single'],
            'default' => $meta_args['default'],
            'auth_callback' => function () {
                return current_user_can('edit_posts');
            },
        ]);
    }

    // Novo Portfolio meta fields
    $portfolio_meta = [
        'portfolio_type' => [
            'type' => 'string',
            'description' => 'Portfolio item type (gallery, slider, etc.)',
            'single' => true,
            'default' => 'gallery',
        ],
        'items_list' => [
            'type' => 'string',
            'description' => 'Gallery image attachment IDs',
            'single' => true,
            'default' => '',
        ],
        'item_slider' => [
            'type' => 'string',
            'description' => 'Slider image attachment IDs',
            'single' => true,
            'default' => '',
        ],
        'gallery_cols' => [
            'type' => 'string',
            'description' => 'Number of gallery columns',
            'single' => true,
            'default' => '3',
        ],
        'short_description' => [
            'type' => 'string',
            'description' => 'Short description for the portfolio item',
            'single' => true,
            'default' => '',
        ],
    ];

    foreach ($portfolio_meta as $meta_key => $meta_args) {
        register_post_meta('pt-portfolio', $meta_key, [
            'show_in_rest' => true,
            'type' => $meta_args['type'],
            'description' => $meta_args['description'],
            'single' => $meta_args['single'],
            'default' => $meta_args['default'],
            'auth_callback' => function () {
                return current_user_can('edit_posts');
            },
        ]);
    }

    // Also register ARMember meta for custom post types so restrictions work
    $arm_meta = [
        'arm_access_plan' => [
            'type' => 'array',
            'description' => 'ARMember access plan IDs',
            'single' => true,
            'show_in_rest' => [
                'schema' => [
                    'type' => 'array',
                    'items' => ['type' => 'string'],
                ],
            ],
        ],
        'arm_item_protection' => [
            'type' => 'integer',
            'description' => 'ARMember item protection flag',
            'single' => true,
            'default' => 0,
        ],
    ];

    foreach (['proof_gallery', 'pt-portfolio'] as $cpt) {
        foreach ($arm_meta as $meta_key => $meta_args) {
            $rest_config = isset($meta_args['show_in_rest']) ? $meta_args['show_in_rest'] : true;
            register_post_meta($cpt, $meta_key, [
                'show_in_rest' => $rest_config,
                'type' => $meta_args['type'],
                'description' => $meta_args['description'],
                'single' => $meta_args['single'],
                'default' => isset($meta_args['default']) ? $meta_args['default'] : null,
                'auth_callback' => function () {
                    return current_user_can('edit_posts');
                },
            ]);
        }
    }
}, 20);

/**
 * Enable REST API for Novo portfolio taxonomy
 */
add_filter('register_taxonomy_args', function ($args, $taxonomy) {
    if ($taxonomy === 'pt-portfolio-category' || $taxonomy === 'portfolio_tag') {
        $args['show_in_rest'] = true;
    }
    return $args;
}, 25, 2);
