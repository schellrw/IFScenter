import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { Box, Typography } from '@mui/material';
import { COMMON_EMOTIONS } from '../constants';

// Create a lookup map for COMMON_EMOTIONS colors (case-insensitive)
const commonEmotionColorMap = COMMON_EMOTIONS.reduce((acc, emotion) => {
  acc[emotion.label.toLowerCase()] = emotion.color;
  return acc;
}, {});

// Define a more varied secondary color palette for other emotions
const secondaryColorPalette = [
  '#81c784', // Material UI Green 300
  '#64b5f6', // Material UI Blue 300
  '#ffb74d', // Material UI Orange 300
  '#90a4ae', // Material UI Blue Grey 300
  '#a1887f', // Material UI Brown 300
];
let secondaryColorIndex = 0;
const assignedSecondaryColors = {}; // Keep track of assigned colors for consistency

const EmotionsChart = ({ parts, height = 200 }) => {
  const svgRef = useRef(null);
  
  useEffect(() => {
    // Reset index and map for each render to ensure consistent color assignment run-to-run
    secondaryColorIndex = 0;
    Object.keys(assignedSecondaryColors).forEach(key => delete assignedSecondaryColors[key]);

    if (!parts || parts.length === 0 || !svgRef.current) return;
    
    d3.select(svgRef.current).selectAll('*').remove();
    
    const emotionCount = {};
    
    // Count emotions from all parts
    parts.forEach(part => {
      if (part.feelings && Array.isArray(part.feelings)) {
        part.feelings.forEach(feeling => {
          if (typeof feeling !== 'string' || !feeling.trim()) return; // Skip non-strings/empty
          
          const feelingLower = feeling.toLowerCase().trim();
          
          // Get color: Check common map first, then assigned secondary, then assign new secondary
          let color = commonEmotionColorMap[feelingLower];
          if (!color) {
            if (assignedSecondaryColors[feelingLower]) {
              color = assignedSecondaryColors[feelingLower];
            } else {
              color = secondaryColorPalette[secondaryColorIndex % secondaryColorPalette.length];
              assignedSecondaryColors[feelingLower] = color;
              secondaryColorIndex++;
            }
          }
          
          if (!emotionCount[feelingLower]) {
            emotionCount[feelingLower] = { count: 0, color: color };
          }
          emotionCount[feelingLower].count++;
          // Ensure color is updated if it was initialized differently (e.g., common emotion added later)
          emotionCount[feelingLower].color = color; 
        });
      }
    });
    
    // Convert to array, filter, sort
    const data = Object.entries(emotionCount)
      .map(([emotion, data]) => ({ ...data, emotion })) // Include emotion name
      .filter(item => item.count > 0)  
      .sort((a, b) => b.count - a.count);  
    
    if (data.length === 0) { // Handle case where no valid emotions are found
         // Optionally render a message here instead of an empty chart
         const svg = d3.select(svgRef.current);
         svg.append('text')
            .attr('x', (svgRef.current.clientWidth || 300) / 2)
            .attr('y', height / 2)
            .attr('text-anchor', 'middle')
            .style('font-size', '12px')
            .style('fill', '#888')
            .text('No part emotions recorded');
         return;
     }
    
    // D3 Setup (dimensions, svg, scales remain mostly the same)
    const width = svgRef.current.clientWidth || 300;
    // Increase bottom margin significantly for labels
    const margin = { top: 30, right: 30, bottom: 80, left: 40 }; 
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    
    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height);
    
    const g = svg.append('g')
      .attr('transform', `translate(${margin.left}, ${margin.top})`);
    
    const xScale = d3.scaleBand()
      .domain(data.map(d => d.emotion)) // Use emotion field added earlier
      .range([0, chartWidth])
      .padding(0.3);
    
    const yScale = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.count) * 1.1 || 1]) // Ensure domain starts at 0, handle empty data max
      .range([chartHeight, 0]);
    
    // Add axes
    g.append('g')
      .attr('transform', `translate(0, ${chartHeight})`)
      .call(d3.axisBottom(xScale))
      .selectAll('text')
      .attr('transform', 'rotate(-45)')
      .style('text-anchor', 'end')
      .attr('dx', '-.8em')
      .attr('dy', '.15em')
      .style('font-size', '12px'); // Keep increased font size
    
    g.append('g')
      .call(d3.axisLeft(yScale).ticks(Math.min(5, d3.max(data, d => d.count) || 1)).tickFormat(d3.format("d"))) // Integer format, adjust ticks
      .style('font-size', '10px');
    
    // Add bars (using the color determined in data processing)
    g.selectAll('.bar')
      .data(data)
      .enter().append('rect')
      .attr('class', 'bar')
      .attr('x', d => xScale(d.emotion))
      .attr('y', d => yScale(d.count))
      .attr('width', xScale.bandwidth())
      .attr('height', d => chartHeight - yScale(d.count))
      .attr('fill', d => d.color) // Use the assigned color
      .attr('rx', 4)  
      .attr('ry', 4)
      .style('opacity', 0.85)
      // Add Tooltip via <title> element on hover
      .on('mouseover', function(event, d) { 
        d3.select(this).style('opacity', 1);
        // Capitalize emotion for tooltip
        const capitalizedEmotion = d.emotion.charAt(0).toUpperCase() + d.emotion.slice(1);
        d3.select(this).append('title')
          .text(`${capitalizedEmotion}: ${d.count}`);
      })
      .on('mouseout', function() { 
        d3.select(this).style('opacity', 0.85);
        d3.select(this).select('title').remove(); // Remove title on mouseout
      });
      
    
    // Add value labels on top of bars
    g.selectAll('.label')
      .data(data)
      .enter().append('text')
      .attr('class', 'label')
      .attr('x', d => xScale(d.emotion) + xScale.bandwidth() / 2)
      .attr('y', d => yScale(d.count) - 5)
      .attr('text-anchor', 'middle')
      .style('font-size', '10px')
      .style('fill', '#333')
      .text(d => d.count);
      
    // Add title (slightly adjusted y position due to margin change)
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', margin.top / 1.5) // Adjusted position slightly
      .attr('text-anchor', 'middle')
      .style('font-size', '14px') // Slightly larger title
      .style('fill', '#555')
      .text('Emotions Across Parts');
      
  }, [parts, height]);
  
  // Display message if parts array exists but is empty
  if (parts && parts.length === 0) {
    return (
      <Box sx={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          Add parts to see emotion distribution.
        </Typography>
      </Box>
    );
  }
  
  return (
    <Box sx={{ width: '100%', height }}>
      <svg ref={svgRef} width="100%" height={height} />
    </Box>
  );
};

export default EmotionsChart; 