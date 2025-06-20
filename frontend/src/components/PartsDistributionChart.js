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
    
    // Separate 'Self' part if it exists, using 'self' (case-insensitive)
    const selfPart = parts.find(p => p.role?.toLowerCase() === 'self');
    const otherParts = parts.filter(p => p.role?.toLowerCase() !== 'self');
    
    // Get role counts for non-Self parts
    const roleCounts = {};
    otherParts.forEach(part => {
      const role = part.role || 'unknown';
      roleCounts[role] = (roleCounts[role] || 0) + 1;
    });
    
    // Prepare data for pie chart (excluding Self)
    const data = Object.entries(roleCounts).map(([role, count]) => ({
      role,
      count
    }));
    
    // Calculate total count for percentage calculation (excluding Self)
    const totalOtherParts = otherParts.length;
    
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
      })
      .on('mouseout', function() {
        d3.select(this)
          .style('opacity', 0.8)
          .attr('stroke', 'white')
          .style('stroke-width', '2px');
      });
    
    // Add the center circle for 'Self' if it exists
    if (selfPart) {
      svg.append('circle')
        .attr('cx', 0)
        .attr('cy', 0)
        .attr('r', radius * 0.45) // Make it slightly smaller than the inner radius
        .attr('fill', getColorForRole('self'))
        .attr('stroke', 'white')
        .style('stroke-width', '2px');

      svg.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em') // Vertically center
        .text('Self')
        .style('fill', 'white') // Adjust color for contrast if needed
        .style('font-size', '14px')
        .style('font-weight', 'bold')
        .style('pointer-events', 'none'); // Prevent text from interfering with mouse events
    }
    
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
        // Only show label if the segment is big enough (e.g., more than 5% of non-self parts)
        // Use totalOtherParts for percentage calculation
        return totalOtherParts > 0 && (d.data.count / totalOtherParts > 0.05) ? d.data.role : '';
      })
      .style('font-size', '10px')
      .style('fill', '#333');
    
    // Add count labels inside arcs (only for segments > 10% of non-self parts)
    svg.selectAll('g.count')
      .data(pie(data))
      .enter()
      // Use totalOtherParts for percentage calculation
      .filter(d => totalOtherParts > 0 && d.data.count / totalOtherParts > 0.1) 
      .append('text')
      .attr('transform', d => `translate(${arc.centroid(d)})`)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'middle')
      .text(d => d.data.count)
      .style('font-size', '12px')
      .style('font-weight', 'bold')
      .style('fill', 'white')
      .style('pointer-events', 'none');
    
  }, [parts, height]); // Added height dependency as it affects calculations
  
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