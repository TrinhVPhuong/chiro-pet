use serde::{Deserialize, Serialize};
use std::collections::{HashMap, BinaryHeap};
use std::fs;
use std::path::Path;
use std::cmp::Ordering;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PoseNode {
    pub id: String,
    pub tag: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransitionEdge {
    pub from_node: String,
    pub to_node: String,
    pub transition_animation: String,
    pub cost: f32,
    pub can_interrupt: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransitionGraph {
    pub nodes: HashMap<String, PoseNode>,
    pub edges: Vec<TransitionEdge>,
}

#[derive(Copy, Clone, PartialEq)]
struct State {
    cost: f32,
    node: usize,
}

// Custom ordering for BinaryHeap to make it a min-heap
impl Eq for State {}

impl Ord for State {
    fn cmp(&self, other: &Self) -> Ordering {
        // Flip ordering on costs for min-heap
        other.cost.partial_cmp(&self.cost).unwrap_or(Ordering::Equal)
            .then_with(|| self.node.cmp(&other.node))
    }
}

impl PartialOrd for State {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl TransitionGraph {
    pub fn new() -> Self {
        Self {
            nodes: HashMap::new(),
            edges: Vec::new(),
        }
    }

    pub fn load_from_file<P: AsRef<Path>>(path: P) -> Result<Self, String> {
        let content = fs::read_to_string(path).map_err(|e| format!("Failed to read transition graph: {}", e))?;
        let graph: TransitionGraph = serde_json::from_str(&content).map_err(|e| format!("Failed to parse transition graph: {}", e))?;
        Ok(graph)
    }

    /// Finds the shortest path of transition animations from start_node to target_node using Dijkstra's algorithm.
    pub fn find_path(&self, start: &str, target: &str) -> Option<Vec<String>> {
        if start == target {
            return Some(vec![]);
        }

        // Map node IDs to indices for Dijkstra
        let mut node_to_idx: HashMap<String, usize> = HashMap::new();
        
        for (i, id) in self.nodes.keys().enumerate() {
            node_to_idx.insert(id.clone(), i);
        }

        let start_idx = *node_to_idx.get(start)?;
        let target_idx = *node_to_idx.get(target)?;

        // Build adjacency list
        let mut adj: Vec<Vec<(usize, &TransitionEdge)>> = vec![vec![]; self.nodes.len()];
        for edge in &self.edges {
            if let (Some(&u), Some(&v)) = (node_to_idx.get(&edge.from_node), node_to_idx.get(&edge.to_node)) {
                adj[u].push((v, edge));
            }
        }

        // distances array
        let mut dist: Vec<f32> = vec![f32::INFINITY; self.nodes.len()];
        let mut heap = BinaryHeap::new();
        let mut parent: HashMap<usize, (usize, String)> = HashMap::new(); // current -> (prev, transition_animation)

        dist[start_idx] = 0.0;
        heap.push(State { cost: 0.0, node: start_idx });

        while let Some(State { cost, node }) = heap.pop() {
            if node == target_idx {
                // Found path, reconstruct it
                let mut path = Vec::new();
                let mut curr = target_idx;
                while let Some(&(prev, ref anim)) = parent.get(&curr) {
                    path.push(anim.clone());
                    curr = prev;
                }
                path.reverse();
                return Some(path);
            }

            if cost > dist[node] {
                continue;
            }

            for &(next_node, edge) in &adj[node] {
                let next_cost = cost + edge.cost;
                if next_cost < dist[next_node] {
                    heap.push(State { cost: next_cost, node: next_node });
                    dist[next_node] = next_cost;
                    parent.insert(next_node, (node, edge.transition_animation.clone()));
                }
            }
        }

        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_find_path() {
        let mut nodes = HashMap::new();
        nodes.insert("Stand".to_string(), PoseNode { id: "Stand".to_string(), tag: "stand".to_string() });
        nodes.insert("Sit".to_string(), PoseNode { id: "Sit".to_string(), tag: "sit".to_string() });
        nodes.insert("Laying".to_string(), PoseNode { id: "Laying".to_string(), tag: "laying".to_string() });

        let edges = vec![
            TransitionEdge {
                from_node: "Stand".to_string(),
                to_node: "Sit".to_string(),
                transition_animation: "action_crouch".to_string(),
                cost: 1.0,
                can_interrupt: false,
            },
            TransitionEdge {
                from_node: "Sit".to_string(),
                to_node: "Laying".to_string(),
                transition_animation: "action_crawling".to_string(),
                cost: 1.0,
                can_interrupt: false,
            },
        ];

        let graph = TransitionGraph { nodes, edges };

        let path = graph.find_path("Stand", "Laying").unwrap();
        assert_eq!(path, vec!["action_crouch".to_string(), "action_crawling".to_string()]);
    }
}
