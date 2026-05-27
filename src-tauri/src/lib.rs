mod core;
mod commands;
mod input_tracking;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Initialize App Data Directory
            let app_data_dir = core::fs_utils::init_app_data_dir(&app_handle)
                .expect("Failed to initialize app data directory");

            // Setup Animation Director
            // Anchor Point 2: Scan from both Resource Dir (default animations) and AppData (user custom animations).
            let mut scanned_animations = Vec::new();
            
            // 1. Scan default animations bundled with the app
            let resource_anim_dir = app.path().resource_dir().unwrap_or_default().join("public").join("animation");
            if resource_anim_dir.exists() {
                let mut default_anims = core::behavior::asset_scanner::scan_animations(&resource_anim_dir);
                scanned_animations.append(&mut default_anims);
            }

            // 2. Scan custom user animations in AppData
            let app_data_anim_dir = app_data_dir.join("animations");
            if app_data_anim_dir.join("vrma").exists() {
                let mut custom_anims = core::behavior::asset_scanner::scan_animations(&app_data_anim_dir);
                // In a more advanced implementation, we might want to deduplicate by ID, but for now we just append
                scanned_animations.append(&mut custom_anims);
            }
            
            let manifest = core::behavior::AnimationManifest {
                version: "1.0".to_string(),
                default_crossfade_ms: 300.0,
                animations: scanned_animations,
            };
            
            let animation_director = std::sync::Arc::new(core::behavior::AnimationDirector::new_with_manifest(manifest));
            app.manage(animation_director.clone());

            // Initialize TransitionGraph and TransitionEngine
            let mut graph = core::behavior::TransitionGraph::new();
            
            // In a real app we load from resource_dir or app_data_dir.
            let resource_path = app.path().resource_dir().unwrap_or_default().join("public").join("animation").join("transition_graph.json");
            if let Ok(loaded_graph) = core::behavior::TransitionGraph::load_from_file(&resource_path) {
                graph = loaded_graph;
            } else {
                println!("Warning: Could not load transition_graph.json from {:?}, using empty graph", resource_path);
            }

            // Initialize P0 State System
            let state_manager = tauri::async_runtime::block_on(async {
                core::state::StateManager::new().await.expect("Failed to initialize StateManager")
            });
            let mut state_manager_arc = std::sync::Arc::new(state_manager);
            
            // Wait for DB init in background or block
            let mut state_manager_clone = std::sync::Arc::clone(&state_manager_arc);
            tauri::async_runtime::block_on(async {
                // To mutate Arc we need to unwrap or use interior mutability. 
                // Since this is initialization, we extract, mutate, and put back into Arc.
                if let Some(mut st) = std::sync::Arc::get_mut(&mut state_manager_clone) {
                    if let Err(e) = st.init_db(&app_handle).await {
                        log::error!("Failed to initialize DB: {:?}", e);
                    }
                }
            });
            state_manager_arc = state_manager_clone;

            app.manage(state_manager_arc.clone());
            
            let transition_engine = std::sync::Arc::new(core::behavior::TransitionEngine::new(
                graph, 
                animation_director.clone(),
                state_manager_arc.clone()
            ));
            app.manage(transition_engine.clone());

            // Initialize Offline Utility AI Proactivity Ticker
            let mut actions_pool = std::collections::HashMap::new();
            
            // Hardcode some test actions for Phase 4
            let lay_down = core::behavior::utility_ai::action::UtilityAction {
                id: "take_a_nap".into(),
                target_pose: "Laying".into(),
                animation_tags: vec!["idle".into()],
                base_weight: 1.0,
                considerations: vec![
                    core::behavior::utility_ai::action::Consideration {
                        state_field: "energy".into(),
                        curve: core::behavior::utility_ai::scoring::ScoringCurve {
                            curve_type: core::behavior::utility_ai::scoring::CurveType::InverseQuadratic,
                            m: 1.0, k: 0.0, b: 0.0, c: 1.0,
                        },
                        weight: 1.0,
                    }
                ],
                state_effects: core::state::CharacterStateDelta {
                    energy: 20, mood: 1, affinity: 0, trust: 0,
                    familiarity: 0, curiosity: 0, patience: 0, confidence: 0,
                },
                cooldown_seconds: 60,
                can_interrupt: false,
            };

            let play_around = core::behavior::utility_ai::action::UtilityAction {
                id: "play_around".into(),
                target_pose: "Stand".into(),
                animation_tags: vec!["dance".into()],
                base_weight: 1.0,
                considerations: vec![
                    core::behavior::utility_ai::action::Consideration {
                        state_field: "mood".into(),
                        curve: core::behavior::utility_ai::scoring::ScoringCurve {
                            curve_type: core::behavior::utility_ai::scoring::CurveType::InverseQuadratic,
                            m: 1.0, k: 0.0, b: 0.0, c: 1.0,
                        },
                        weight: 1.0,
                    }
                ],
                state_effects: core::state::CharacterStateDelta {
                    energy: -5, mood: 5, affinity: 0, trust: 0,
                    familiarity: 0, curiosity: 0, patience: 0, confidence: 0,
                },
                cooldown_seconds: 30,
                can_interrupt: false,
            };

            actions_pool.insert("take_a_nap".into(), lay_down);
            actions_pool.insert("play_around".into(), play_around);

            let proactivity_ticker = core::behavior::utility_ai::ticker::ProactivityTicker::new(
                state_manager_arc.clone(),
                transition_engine.clone(),
                actions_pool,
                app_handle.clone()
            );

            let ticker_arc = std::sync::Arc::new(proactivity_ticker);
            let ticker_clone = ticker_arc.clone();

            // Run ticker every 15 seconds
            tauri::async_runtime::spawn(async move {
                ticker_clone.run_loop(15).await;
            });

            // Initialize Decay Engine
            let decay_engine = core::state::decay::DecayEngine::new(state_manager_arc.clone());
            let decay_engine_arc = std::sync::Arc::new(decay_engine);
            let decay_clone = decay_engine_arc.clone();
            
            // Run decay every 60 seconds
            tauri::async_runtime::spawn(async move {
                decay_clone.run_loop(60).await;
            });

            // Initialize AI Orchestrator
            let ai_orchestrator = std::sync::Arc::new(core::behavior::ai::AIOrchestrator::new(
                state_manager_arc.clone(),
                animation_director.clone(),
                app_handle.clone(),
            ));
            app.manage(ai_orchestrator);

            // Start background input tracking (ALT key polling)
            input_tracking::spawn_input_tracker(app_handle);

            // Make window click-through initially
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_ignore_cursor_events(true);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::set_click_through,
            commands::anim_play,
            commands::anim_stop_context,
            commands::anim_force_idle,
            commands::anim_list_available,
            commands::procedural_get_settings,
            commands::get_app_data_dir_path,
            commands::open_app_data_dir,
            commands::notify_animation_finished,
            commands::ai_send_chat
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
