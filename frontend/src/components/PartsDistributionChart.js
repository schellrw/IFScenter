import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { Box, Typography, CircularProgress } from '@mui/material';

const PartsDistributionChart = ({ parts, height = 200 }) => {
  const svgRef = useRef(null);
  
  // Add the getColorForRole function that matches the SystemMapVisualization
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
  
  useEffect(() => {
    if (!parts || parts.length === 0 || !svgRef.current) return;
    
    // Clear previous chart
    d3.select(svgRef.current).selectAll('*').remove();
    
    // Get role counts
    const roleCounts = {};
    parts.forEach(part => {
      const role = part.role || 'unknown';
      roleCounts[role] = (roleCounts[role] || 0) + 1;
    });
    
    // Prepare data for pie chart
    const data = Object.entries(roleCounts).map(([role, count]) => ({
      role,
      count
    }));
    
    // Sort data alphabetically by role
    data.sort((a, b) => a.role.localeCompare(b.role));
    
    // Set up dimensions
    const width = svgRef.current.clientWidth || 300;
    const margin = 10;
    const radius = Math.min(width, height) / 2 - margin;
    
    // Create SVG
    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${width / 2}, ${height / 2})`);
    
    // Create pie layout
    const pie = d3.pie()
      .value(d => d.count)
      .sort(null);
    
    // Create arc generator
    const arc = d3.arc()
      .innerRadius(radius * 0.5) // Donut hole size
      .outerRadius(radius * 0.8);
    
    // Create outer arc for labels
    const outerArc = d3.arc()
      .innerRadius(radius * 0.9)
      .outerRadius(radius * 0.9);
    
    // Use the getColorForRole function instead of D3's color scale
    
    // Add the arcs
    const arcs = svg.selectAll('path')
      .data(pie(data))
      .enter()
      .append('path')
      .attr('d', arc)
      .attr('fill', d => getColorForRole(d.data.role))
      .attr('stroke', 'white')
      .style('stroke-width', '2px')
      .style('opacity', 0.8)
      .on('mouseover', function(event, d) {
        d3.select(this)
          .style('opacity', 1)
          .attr('stroke', '#333')
          .style('stroke-width', '3px');
        
        // Add percentage in the center
        svg.append('text')
          .attr('id', 'percentage')
          .attr('text-anchor', 'middle')
          .attr('dy', '0.35em')
          .attr('font-size', '16px')
          .attr('font-weight', 'bold')
          .text(`${d.data.role}: ${Math.round(d.data.count / parts.length * 100)}%`);
      })
      .on('mouseout', function() {
        d3.select(this)
          .style('opacity', 0.8)
          .attr('stroke', 'white')
          .style('stroke-width', '2px');
        
        // Remove percentage
        svg.select('#percentage').remove();
      });
    
    // Add labels
    const labels = svg.selectAll('g.label')
      .data(pie(data))
      .enter()
      .append('g')
      .attr('class', 'label');
    
    labels.append('polyline')
      .attr('points', function(d) {
        const pos = outerArc.centroid(d);
        return [arc.centroid(d), outerArc.centroid(d), [pos[0], pos[1]]];
      })
      .attr('fill', 'none')
      .attr('stroke', '#999')
      .attr('stroke-width', 1);
    
    labels.append('text')
      .attr('transform', function(d) {
        const pos = outerArc.centroid(d);
        return `translate(${pos[0]}, ${pos[1]})`;
      })
      .attr('dy', '0.35em')
      .attr('text-anchor', d => {
        const midAngle = d.startAngle + (d.endAngle - d.startAngle) / 2;
        return midAngle < Math.PI ? 'start' : 'end';
      })
      .text(d => {
        // Only show label if the segment is big enough (more than 5%)
        return d.data.count / parts.length > 0.05 ? d.data.role : '';
      })
      .style('font-size', '10px')
      .style('fill', '#333');
    
    // Add count labels inside arcs (only for segments > 10%)
    svg.selectAll('g.count')
      .data(pie(data))
      .enter()
      .filter(d => d.data.count / parts.length > 0.1) // Only show for segments > 10%
      .append('text')
      .attr('transform', d => `translate(${arc.centroid(d)})`)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'middle')
      .text(d => d.data.count)
      .style('font-size', '12px')
      .style('font-weight', 'bold')
      .style('fill', 'white')
      .style('pointer-events', 'none');
    
  }, [parts]);
  
  if (!parts) {
    return <CircularProgress />;
  }
  
  if (parts.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', p: 2, height }}>
        <Typography variant="body2" color="text.secondary">
          No parts available to visualize
        </Typography>
      </Box>
    );
  }
  
  return (
    <Box sx={{ width: '100%', height, position: 'relative' }}>
      <svg ref={svgRef} width="100%" height={height} />
    </Box>
  );
};

export default PartsDistributionChart; 