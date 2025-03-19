import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { Box, Typography, Button } from '@mui/material';
import { useNavigate } from 'react-router-dom';

const MiniSystemMap = ({ parts, relationships, height = 200, maxNodes = 10 }) => {
  const svgRef = useRef(null);
  const navigate = useNavigate();
  
  useEffect(() => {
    if (!parts || parts.length === 0 || !svgRef.current) return;
    
    // Clear previous chart
    d3.select(svgRef.current).selectAll('*').remove();
    
    // Limit the number of nodes for the mini map
    const limitedParts = parts.slice(0, maxNodes);
    
    // Filter relationships to only include relationships between visible parts
    const limitedPartIds = limitedParts.map(part => part.id);
    const filteredRelationships = relationships.filter(rel => 
      limitedPartIds.includes(rel.source_id) && limitedPartIds.includes(rel.target_id)
    );
    
    // Format relationships for D3
    const formattedRelationships = filteredRelationships.map(rel => ({
      source: limitedParts.find(p => p.id === rel.source_id),
      target: limitedParts.find(p => p.id === rel.target_id),
      id: rel.id,
      relationship_type: rel.relationship_type
    })).filter(rel => rel.source && rel.target); // Ensure both source and target exist
    
    // Set up dimensions
    const width = svgRef.current.clientWidth || 300;
    const margin = 20; // Increased margin to keep nodes more visible
    const centerX = width / 2;
    const centerY = height / 2;
    
    // Create color function for nodes - use the same colors as in SystemMapVisualization
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
    
    // Create SVG
    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height);
    
    // Create force simulation with stronger center force and weaker charge
    const simulation = d3.forceSimulation(limitedParts)
      .force('charge', d3.forceManyBody().strength(-100)) // Reduced strength
      .force('center', d3.forceCenter(centerX, centerY).strength(0.15)) // Stronger center force
      .force('collision', d3.forceCollide().radius(20))
      .force('link', d3.forceLink(formattedRelationships)
        .id(d => d.id)
        .distance(60));
    
    // Add an additional radial force to keep isolated nodes in view
    simulation.force('radial', d3.forceRadial(
      // Nodes with no links get placed in a circle around the center
      (d) => {
        // Count links connected to this node
        const linkCount = formattedRelationships.filter(
          link => link.source.id === d.id || link.target.id === d.id
        ).length;
        // Return a smaller radius for connected nodes, larger for isolated
        return linkCount === 0 ? Math.min(width, height) * 0.25 : 10;
      },
      centerX, 
      centerY
    ).strength(0.8)); // Strong enough to be effective but not dominate
    
    // Create links
    const links = svg.append('g')
      .selectAll('line')
      .data(formattedRelationships)
      .enter()
      .append('line')
      .attr('stroke', '#999')
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', 1);
    
    // Create nodes
    const nodes = svg.append('g')
      .selectAll('g')
      .data(limitedParts)
      .enter()
      .append('g')
      .attr('cursor', 'pointer')
      .on('click', (event, d) => {
        // Navigate to part detail with source page info
        navigate(`/parts/${d.id}`, { state: { from: 'dashboard' } });
      });
    
    // Add circles to nodes
    nodes.append('circle')
      .attr('r', 10)
      .attr('fill', d => getColorForRole(d.role))
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5);
    
    // Add a title for each node
    nodes.append('title')
      .text(d => d.name);
    
    // Add node labels for larger nodes
    nodes.append('text')
      .text(d => {
        // Only show first character of name
        return d.name ? d.name.charAt(0) : '';
      })
      .attr('text-anchor', 'middle')
      .attr('dy', '.35em')
      .attr('fill', 'white')
      .style('font-size', '8px')
      .style('pointer-events', 'none');
    
    // Update positions on tick
    simulation.on('tick', () => {
      // Keep nodes within bounds - enforce boundaries
      limitedParts.forEach(node => {
        node.x = Math.max(margin, Math.min(width - margin, node.x));
        node.y = Math.max(margin, Math.min(height - margin, node.y));
      });
      
      links
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);
      
      nodes.attr('transform', d => `translate(${d.x}, ${d.y})`);
    });
    
    // Cleanup
    return () => {
      simulation.stop();
    };
  }, [parts, relationships, maxNodes, navigate]);
  
  if (!parts || parts.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', p: 2, height }}>
        <Typography variant="body2" color="text.secondary">
          No parts available to visualize
        </Typography>
        <Button 
          variant="outlined" 
          size="small" 
          onClick={() => navigate('/parts/new')}
          sx={{ mt: 1 }}
        >
          Add a Part
        </Button>
      </Box>
    );
  }
  
  return (
    <Box sx={{ width: '100%', height, position: 'relative' }}>
      <svg ref={svgRef} width="100%" height={height} />
      {parts.length > maxNodes && (
        <Typography variant="caption" sx={{ position: 'absolute', bottom: 5, right: 10, color: 'text.secondary' }}>
          Showing {maxNodes} of {parts.length} parts
        </Typography>
      )}
    </Box>
  );
};

export default MiniSystemMap; 