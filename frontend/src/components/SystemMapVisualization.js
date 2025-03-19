import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { 
  Dialog, 
  DialogTitle, 
  DialogContent,
  DialogActions,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  TextField,
  Box,
  Typography,
  Alert,
  Paper,
  FormControlLabel,
  Switch
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { useNavigate } from 'react-router-dom';
import { ROLE_OPTIONS } from '../constants';
import ClearIcon from '@mui/icons-material/Clear';
import FilterListIcon from '@mui/icons-material/FilterList';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';

const RELATIONSHIP_TYPES = [
  'protects',
  'triggered by',
  'blends with',
  'conflicts with',
  'supports',
  'manages'
];

const SystemMapVisualization = ({ 
  parts, 
  relationships,
  onAddRelationship,
  onUpdateRelationship,
  onDeleteRelationship 
}) => {
  const svgRef = useRef(null);
  const nodesRef = useRef(null);
  const linksRef = useRef(null);
  const linkLabelsRef = useRef(null);
  const tooltipTimeoutRef = useRef(null);
  const [relationshipStart, setRelationshipStart] = useState(null);
  const [relationshipDialog, setRelationshipDialog] = useState({
    open: false,
    source: null,
    target: null,
    type: '',
    description: ''
  });
  const [tooltip, setTooltip] = useState({
    visible: false,
    x: 0,
    y: 0,
    part: null
  });
  const [filters, setFilters] = useState({
    showRelationships: true,
    selectedRoles: [],
    selectedRelationshipTypes: []
  });
  const [filterPanelOpen, setFilterPanelOpen] = useState(true);
  const navigate = useNavigate();

  // Move applyFilters outside useEffect
  const applyFilters = () => {
    if (nodesRef.current) {
      nodesRef.current.style("opacity", d => 
        filters.selectedRoles.length === 0 || filters.selectedRoles.includes(d.role) ? 1 : 0.2
      );
    }
    if (linksRef.current) {
      const visibility = filters.showRelationships ? "visible" : "hidden";
      linksRef.current.style("visibility", visibility)
        .style("opacity", d => 
          filters.selectedRelationshipTypes.length === 0 || 
          filters.selectedRelationshipTypes.includes(d.relationship_type) ? 1 : 0.2
        );
      linkLabelsRef.current.style("visibility", visibility)
        .style("opacity", d => 
          filters.selectedRelationshipTypes.length === 0 || 
          filters.selectedRelationshipTypes.includes(d.relationship_type) ? 1 : 0.2
        );
    }
  };

  useEffect(() => {
    if (!parts.length) return;

    let tooltipTimeout; // Move this inside if it's only used here

    // Format relationships for D3
    const formattedRelationships = relationships.map(rel => ({
      source: parts.find(p => p.id === rel.source_id),
      target: parts.find(p => p.id === rel.target_id),
      id: rel.id,
      relationship_type: rel.relationship_type,
      description: rel.description
    })).filter(rel => rel.source && rel.target); // Ensure both source and target exist

    // Clear previous visualization
    d3.select(svgRef.current).selectAll("*").remove();

    // Setup
    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;
    const padding = 40; // Padding from edges

    const svg = d3.select(svgRef.current)
      .attr("width", width)
      .attr("height", height);

    // Create a container group for all elements
    const container = svg.append("g");

    // Add zoom behavior
    const zoom = d3.zoom()
      .scaleExtent([0.2, 4])
      .on("zoom", (event) => {
        container.attr("transform", event.transform);
      })
      .filter(event => {
        // Allow zoom only on wheel or dblclick events
        return event.type === 'wheel' || event.type === 'dblclick';
      });

    svg.call(zoom);

    // Create force simulation with formatted relationships
    const simulation = d3.forceSimulation(parts)
      .force("link", d3.forceLink(formattedRelationships)
        .id(d => d.id)
        .distance(150))
      .force("charge", d3.forceManyBody()
        .strength(-1000)  // Increased repulsion
        .distanceMax(width)) // Increased range
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(60))
      .force("x", d3.forceX(width / 2).strength(0.1))
      .force("y", d3.forceY(height / 2).strength(0.1));

    // Create arrow marker for relationship lines
    svg.append("defs").selectAll("marker")
      .data(["arrow"])
      .enter().append("marker")
      .attr("id", d => d)
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 25)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#999");

    // Create node groups
    const nodeGroups = container.append("g")
      .attr("class", "nodes");

    const nodes = nodeGroups
      .selectAll("g.node")
      .data(parts)
      .enter()
      .append("g")
      .attr("class", "node")
      .call(d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended));
    nodesRef.current = nodes;

    // Add circles for nodes
    const circles = nodes
      .append("circle")
      .attr("r", 20)
      .attr("fill", d => getColorForRole(d.role))
      .style("cursor", "pointer");

    // Add separate transparent circle for better click handling
    nodes.append("circle")
      .attr("r", 25)
      .attr("fill", "transparent")
      .attr("data-part-id", d => d.id)
      .style("cursor", "pointer")
      .on("mousedown", (event, d) => {
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          event.stopPropagation();
          
          if (!relationshipStart) {
            console.log('Setting start node:', d.name);
            setRelationshipStart(d);
            
            // Highlight the selected node
            const circle = d3.select(event.target.parentNode).select("circle");
            circle
              .attr("stroke", "#000")
              .attr("stroke-width", 2)
              .attr("stroke-opacity", 1)
              .transition()
              .duration(200)
              .attr("r", 25)
              .transition()
              .duration(200)
              .attr("r", 20);
          } else if (relationshipStart.id !== d.id) {
            console.log('Setting end node:', d.name);
            setRelationshipDialog({
              open: true,
              source: relationshipStart,
              target: d,
              type: '',
              description: ''
            });
            
            // Reset all circle highlights
            circles
              .attr("stroke", null)
              .attr("stroke-width", null)
              .attr("stroke-opacity", null)
              .attr("r", 20);
            
            setRelationshipStart(null);
          }
        }
      })
      .on("mouseover", (event, d) => {
        const [x, y] = d3.pointer(event, svg.node());
        setTooltip({
          visible: true,
          x: x + 30, // Offset to not interfere with the node
          y: y - 20,
          part: d
        });
      })
      .on("mouseout", (event) => {
        // Clear any existing timeout
        if (tooltipTimeoutRef.current) {
          clearTimeout(tooltipTimeoutRef.current);
        }
        
        // Create a safe zone between node and tooltip
        const tooltipElement = document.getElementById('part-tooltip');
        if (tooltipElement) {
          const nodeRect = event.target.getBoundingClientRect();
          const tooltipRect = tooltipElement.getBoundingClientRect();
          
          const mouseX = event.clientX;
          const mouseY = event.clientY;
          
          // Check if mouse is moving towards tooltip
          const movingToTooltip = 
            mouseX >= Math.min(nodeRect.right, tooltipRect.left) &&
            mouseX <= Math.max(nodeRect.right, tooltipRect.right) &&
            mouseY >= Math.min(nodeRect.top, tooltipRect.top) &&
            mouseY <= Math.max(nodeRect.bottom, tooltipRect.bottom);
          
          if (movingToTooltip || tooltipElement.matches(':hover')) {
            return;
          }
        }
        
        // Set a timeout to hide the tooltip
        const timeout = setTimeout(() => {
          setTooltip({ visible: false, x: 0, y: 0, part: null });
        }, 300);
        
        tooltipTimeoutRef.current = timeout;
      });

    // Add labels
    nodes.append("text")
      .text(d => d.name)
      .attr("text-anchor", "middle")
      .attr("dy", function(d) {
        // Calculate optimal label position based on node connections
        const connections = formattedRelationships.filter(r => 
          r.source.id === d.id || r.target.id === d.id
        );
        
        if (connections.length === 0) return 30; // Default bottom position
        
        // Calculate average direction of connections
        const avgY = connections.reduce((sum, rel) => {
          const other = rel.source.id === d.id ? rel.target : rel.source;
          return sum + (other.y - d.y);
        }, 0) / connections.length;
        
        // Place label opposite to average connection direction
        return avgY > 0 ? -30 : 30;
      })
      .style("font-size", "12px")
      .style("pointer-events", "none");

    // First, group relationships by their connected nodes
    const groupRelationships = (rels) => {
      const grouped = {};
      rels.forEach(rel => {
        const key = [rel.source.id, rel.target.id].sort().join('-');
        if (!grouped[key]) {
          grouped[key] = [];
        }
        grouped[key].push(rel);
      });
      return grouped;
    };

    // Group relationships
    const groupedRelationships = groupRelationships(formattedRelationships);

    // Add this helper function at the top level
    const getIntersectionPoint = (sourceX, sourceY, targetX, targetY, radius) => {
      const dx = targetX - sourceX;
      const dy = targetY - sourceY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const ratio = (distance - radius) / distance;
      
      return {
        x: sourceX + dx * ratio,
        y: sourceY + dy * ratio
      };
    };

    // Create curved paths for relationships
    const links = container.append("g")
      .selectAll("path")
      .data(formattedRelationships)
      .enter().append("path")
      .attr("fill", "none")
      .attr("stroke", "#999")
      .attr("stroke-opacity", 0.6)
      .attr("stroke-width", 2)
      .attr("marker-end", "url(#arrow)")
      .style("cursor", "pointer")
      .on("click", (event, d) => {
        setRelationshipDialog({
          open: true,
          source: d.source,
          target: d.target,
          type: d.relationship_type,
          description: d.description || '',
          existing: {
            id: d.id,
            relationship_type: d.relationship_type,
            description: d.description
          }
        });
      });
    linksRef.current = links;

    // Add relationship labels with better positioning
    const linkLabels = container.append("g")
      .selectAll("text")
      .data(formattedRelationships)
      .enter().append("text")
      .attr("text-anchor", "middle")
      .attr("dy", -5)
      .text(d => d.relationship_type)
      .style("font-size", "10px")
      .style("fill", "#666")
      .style("pointer-events", "none")
      .style("background-color", "white")
      .style("padding", "2px");
    linkLabelsRef.current = linkLabels;

    // Update positions on each tick
    simulation.on("tick", () => {
      const k = d3.zoomTransform(svg.node()).k || 1;
      
      nodes.attr("transform", d => {
        const x = Math.max(padding/k, Math.min(width - padding/k, d.x));
        const y = Math.max(padding/k, Math.min(height - padding/k, d.y));
        return `translate(${x},${y})`;
      });

      // Update paths and labels
      links.attr("d", d => {
        const sourceX = d.source.x;
        const sourceY = d.source.y;
        const targetX = d.target.x;
        const targetY = d.target.y;
        
        // Get intersection points with node circles
        const sourcePoint = getIntersectionPoint(targetX, targetY, sourceX, sourceY, 20);
        const targetPoint = getIntersectionPoint(sourceX, sourceY, targetX, targetY, 20);
        
        const key = [d.source.id, d.target.id].sort().join('-');
        const relGroup = groupedRelationships[key];
        const isMultiRel = relGroup.length > 1;
        
        if (isMultiRel) {
          const index = relGroup.findIndex(r => r.id === d.id);
          const offset = index === 0 ? 33 : -33;
          
          const midX = (sourcePoint.x + targetPoint.x) / 2;
          const midY = (sourcePoint.y + targetPoint.y) / 2;
          
          const dx = targetPoint.x - sourcePoint.x;
          const dy = targetPoint.y - sourcePoint.y;
          const norm = Math.sqrt(dx * dx + dy * dy);
          
          const shouldFlip = d.source.id > d.target.id;
          const perpX = (shouldFlip ? dy : -dy) / norm * offset;
          const perpY = (shouldFlip ? -dx : dx) / norm * offset;
          
          return `M${sourcePoint.x},${sourcePoint.y}
                  Q${midX + perpX},${midY + perpY}
                  ${targetPoint.x},${targetPoint.y}`;
        } else {
          return `M${sourcePoint.x},${sourcePoint.y}L${targetPoint.x},${targetPoint.y}`;
        }
      });

      // Position labels along the paths
      linkLabels.each(function(d) {
        const path = links.filter(l => l.id === d.id).node();
        if (path) {
          const pathLength = path.getTotalLength();
          const midPoint = path.getPointAtLength(pathLength / 2);
          
          // Add a white background rectangle for better readability
          const bbox = this.getBBox();
          const padding = 2;
          
          d3.select(this)
            .attr("x", midPoint.x)
            .attr("y", midPoint.y)
            .attr("dx", -bbox.width / 2 - padding)
            .attr("dy", -padding);
        }
      });

      // Reapply filters after each tick
      applyFilters();
    });

    // Update drag behavior to work with zoom
    function dragstarted(event) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }

    function dragged(event) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
      applyFilters();
    }

    function dragended(event) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
      applyFilters();
    }

    // Add double-click to reset zoom and center
    svg.on("dblclick.zoom", () => {
      svg.transition()
        .duration(750)
        .call(zoom.transform, d3.zoomIdentity);
      
      // Recenter nodes
      simulation.force("center", d3.forceCenter(width / 2, height / 2))
        .alpha(0.3)
        .restart();
    });

    // Cleanup function
    return () => {
      simulation.stop();
      if (tooltipTimeoutRef.current) {
        clearTimeout(tooltipTimeoutRef.current);
      }
    };
  }, [parts, relationships, relationshipStart, filters, navigate, applyFilters]);

  const handleRelationshipSave = async () => {
    const { source, target, type, description, existing } = relationshipDialog;
    
    console.log('Saving relationship:', { source, target, type, description });  // Debug log
    
    if (!type || !source || !target) {
      console.log('Missing required fields:', { source, target, type });  // Debug log
      alert('Please select a relationship type');
      return;
    }

    try {
      if (existing) {
        console.log('Updating existing relationship:', existing);
        await onUpdateRelationship(existing.id, {
          relationship_type: type,
          description
        });
      } else {
        const relationshipData = {
          source_id: source.id,
          target_id: target.id,
          relationship_type: type,
          description
        };
        console.log('Creating new relationship:', relationshipData);  // Debug log
        await onAddRelationship(relationshipData);
      }
      
      handleDialogClose();
    } catch (error) {
      console.error('Failed to save relationship:', error);
      alert(`Failed to create relationship: ${error.message}`);
    }
  };

  const handleDialogClose = () => {
    setRelationshipDialog({
      open: false,
      source: null,
      target: null,
      type: '',
      description: ''
    });
    setRelationshipStart(null);
  };

  const handleRelationshipToggle = (checked) => {
    setFilters(prev => ({
      ...prev,
      showRelationships: checked
    }));
    applyFilters();
  };

  const handleRoleFilter = (newRoles) => {
    setFilters(prev => ({
      ...prev,
      selectedRoles: newRoles
    }));
    applyFilters();
  };

  const handleRelationshipFilter = (newTypes) => {
    setFilters(prev => ({
      ...prev,
      selectedRelationshipTypes: newTypes
    }));
    applyFilters();
  };

  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Filter Panel */}
      <Paper
        sx={{
          position: 'absolute',
          top: 16,
          right: 16,
          p: 2,
          zIndex: 1000,
          maxWidth: 300,
          maxHeight: '80vh',
          overflow: 'auto'
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="h6">
            Filters
          </Typography>
          <IconButton 
            size="small" 
            onClick={() => setFilterPanelOpen(!filterPanelOpen)}
          >
            <FilterListIcon />
          </IconButton>
        </Box>

        <Collapse in={filterPanelOpen}>
          {/* Relationship Toggle */}
          <FormControlLabel
            control={
              <Switch
                checked={filters.showRelationships}
                onChange={(e) => handleRelationshipToggle(e.target.checked)}
              />
            }
            label="Show Relationships"
          />

          {/* Role Filter */}
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              Filter by Role
              {filters.selectedRoles.length > 0 && (
                <IconButton 
                  size="small" 
                  onClick={() => handleRoleFilter([])}
                  sx={{ ml: 1 }}
                >
                  <ClearIcon fontSize="small" />
                </IconButton>
              )}
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {ROLE_OPTIONS.map(role => (
                <Chip
                  key={role.value}
                  label={role.label}
                  onClick={() => {
                    const newRoles = filters.selectedRoles.includes(role.value)
                      ? filters.selectedRoles.filter(r => r !== role.value)
                      : [...filters.selectedRoles, role.value];
                    handleRoleFilter(newRoles);
                  }}
                  color={filters.selectedRoles.includes(role.value) ? "primary" : "default"}
                  size="small"
                />
              ))}
            </Box>
          </Box>

          {/* Relationship Type Filter */}
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              Filter by Relationship
              {filters.selectedRelationshipTypes.length > 0 && (
                <IconButton 
                  size="small" 
                  onClick={() => handleRelationshipFilter([])}
                  sx={{ ml: 1 }}
                >
                  <ClearIcon fontSize="small" />
                </IconButton>
              )}
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {RELATIONSHIP_TYPES.map(type => (
                <Chip
                  key={type}
                  label={type}
                  onClick={() => {
                    const newTypes = filters.selectedRelationshipTypes.includes(type)
                      ? filters.selectedRelationshipTypes.filter(t => t !== type)
                      : [...filters.selectedRelationshipTypes, type];
                    handleRelationshipFilter(newTypes);
                  }}
                  color={filters.selectedRelationshipTypes.includes(type) ? "primary" : "default"}
                  size="small"
                />
              ))}
            </Box>
          </Box>
        </Collapse>
      </Paper>

      {relationshipStart && (
        <Alert 
          severity="info" 
          sx={{ 
            position: 'absolute', 
            top: 16, 
            left: '50%', 
            transform: 'translateX(-50%)',
            zIndex: 1 
          }}
        >
          Select another part to create a relationship from "{relationshipStart.name}"
        </Alert>
      )}

      <svg 
        ref={svgRef} 
        style={{ width: '100%', height: '100%' }}
      />
      
      {/* Part Details Tooltip */}
      {tooltip.visible && tooltip.part && (
        <Box
          id="part-tooltip"
          sx={{
            position: 'absolute',
            left: tooltip.x,
            top: tooltip.y,
            backgroundColor: 'white',
            border: '1px solid #ccc',
            borderRadius: '4px',
            padding: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
            zIndex: 1000,
            minWidth: '200px',
            pointerEvents: 'auto',
            transition: 'opacity 0.2s ease-in-out',
            '&:hover': {
              visibility: 'visible'
            }
          }}
          onMouseEnter={() => {
            if (tooltipTimeoutRef.current) {
              clearTimeout(tooltipTimeoutRef.current);
              tooltipTimeoutRef.current = null;
            }
          }}
          onMouseLeave={(event) => {
            // Check if moving back to node
            const nodeElement = document.querySelector(`[data-part-id="${tooltip.part.id}"]`);
            if (nodeElement) {
              const nodeRect = nodeElement.getBoundingClientRect();
              const mouseX = event.clientX;
              const mouseY = event.clientY;
              
              const movingToNode = 
                mouseX >= nodeRect.left &&
                mouseX <= nodeRect.right &&
                mouseY >= nodeRect.top &&
                mouseY <= nodeRect.bottom;
              
              if (movingToNode) {
                return;
              }
            }
            
            setTooltip({ visible: false, x: 0, y: 0, part: null });
          }}
        >
          <Typography variant="subtitle2" gutterBottom>
            {tooltip.part.name}
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            {tooltip.part.role || 'No role specified'}
          </Typography>
          <Typography variant="body2" noWrap sx={{ mb: 1 }}>
            {tooltip.part.description?.slice(0, 100) || 'No description'}
            {tooltip.part.description?.length > 100 ? '...' : ''}
          </Typography>
          <Button
            size="small"
            variant="outlined"
            onClick={() => navigate(`/parts/${tooltip.part.id}`, { 
              state: { from: 'system-map' }
            })}
            sx={{ width: '100%' }}
          >
            View Details
          </Button>
        </Box>
      )}

      <Dialog 
        open={relationshipDialog.open} 
        onClose={handleDialogClose}
      >
        <DialogTitle>
          {relationshipDialog.existing ? 'Edit Relationship' : 'Create Relationship'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <Typography gutterBottom>
              {relationshipDialog.existing ? (
                `Relationship from "${relationshipDialog.source?.name}" to "${relationshipDialog.target?.name}"`
              ) : (
                `Creating relationship from "${relationshipDialog.source?.name}" to "${relationshipDialog.target?.name}"`
              )}
            </Typography>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Relationship Type</InputLabel>
              <Select
                value={relationshipDialog.type}
                onChange={(e) => setRelationshipDialog(prev => ({
                  ...prev,
                  type: e.target.value
                }))}
                required
              >
                {RELATIONSHIP_TYPES.map(type => (
                  <MenuItem key={type} value={type}>
                    {type}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            
            <TextField
              fullWidth
              multiline
              rows={3}
              label="Description (optional)"
              value={relationshipDialog.description}
              onChange={(e) => setRelationshipDialog(prev => ({
                ...prev,
                description: e.target.value
              }))}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'space-between', px: 3, pb: 2 }}>
          <Box>
            {relationshipDialog.existing && (
              <Button 
                color="error" 
                onClick={async () => {
                  if (window.confirm('Are you sure you want to delete this relationship?')) {
                    try {
                      await onDeleteRelationship(relationshipDialog.existing.id);
                      handleDialogClose();
                    } catch (error) {
                      console.error('Failed to delete relationship:', error);
                      alert('Failed to delete relationship');
                    }
                  }
                }}
                startIcon={<DeleteIcon />}
              >
                Delete
              </Button>
            )}
          </Box>
          <Box>
            <Button onClick={handleDialogClose} sx={{ mr: 1 }}>
              Cancel
            </Button>
            <Button 
              onClick={handleRelationshipSave} 
              variant="contained"
              disabled={!relationshipDialog.type}
            >
              {relationshipDialog.existing ? 'Update' : 'Create'}
            </Button>
          </Box>
        </DialogActions>
      </Dialog>

      {/* Instructions */}
      {!relationshipStart && (
        <Box
          sx={{
            position: 'absolute',
            bottom: 16,
            left: 16,
            backgroundColor: 'rgba(255,255,255,0.9)',
            padding: 2,
            borderRadius: 1,
            boxShadow: 1
          }}
        >
          <Typography variant="body2">
            • Click and drag nodes to move them
            <br />
            • Ctrl/Cmd + Click two parts to create a relationship
            <br />
            • Click a relationship line to edit it
          </Typography>
        </Box>
      )}
    </Box>
  );
};

const getColorForRole = (role) => {
  const roleColors = {
    'protector': '#ff7f0e',
    'exile': '#1f77b4',
    'manager': '#2ca02c',
    'firefighter': '#d62728',
    'self': '#9467bd',
    'default': '#7f7f7f'
  };
  return roleColors[role?.toLowerCase()] || roleColors.default;
};

export default SystemMapVisualization; 