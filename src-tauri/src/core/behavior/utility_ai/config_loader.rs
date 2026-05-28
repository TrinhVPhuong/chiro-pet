use std::collections::HashMap;
use std::fs;
use std::path::Path;

use super::action::UtilityAction;

pub fn load_utility_actions(path: &Path) -> Result<HashMap<String, UtilityAction>, String> {
    if !path.exists() {
        return Err(format!("Utility actions config file not found at: {:?}", path));
    }

    let file_content = fs::read_to_string(path).map_err(|e| format!("Failed to read utility actions file: {}", e))?;
    
    let actions_list: Vec<UtilityAction> = serde_json::from_str(&file_content)
        .map_err(|e| format!("Failed to parse utility actions JSON: {}", e))?;
        
    let mut actions_pool = HashMap::new();
    for action in actions_list {
        actions_pool.insert(action.id.clone(), action);
    }
    
    Ok(actions_pool)
}
