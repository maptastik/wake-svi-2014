(function() {

    // PSEUDO-GLOBALS
    const files = ["./data/nc_counties.topojson", "./data/wake_tracts_2010.topojson", "./data/cdc_svi_wake_2014_clean.csv"];
    const attrArray = ["RPL_THEME1", "RPL_THEME2", "RPL_THEME3", "RPL_THEME4", "RPL_THEMES"];
    const attrAliasArray = ["Socioeconomics", "Housing Composition and Disability", "Minority Status and Language", "Housing and Transportation", "Overall"];
    let expressed = attrArray[4];
    const colorClasses = ["#005353", "#007b7b", "#00a4a4", "#00cccc", "#00ffff"];

    let windowHeight = window.innerHeight;
    let vizElementHeight = (windowHeight - 30) / 2; 

    // Chart Pseudo-Globals
    // let chartWidth = window.innerWidth,
    let chartWidth = $("#chart").outerWidth(),
        chartHeight = vizElementHeight,
        leftPadding = 25,
        rightPadding = 0,
        topBottomPadding = 5,
        chartInnerWidth = chartWidth - leftPadding - rightPadding,
        chartInnerHeight = chartHeight - topBottomPadding * 2,
        translate = "translate(" + leftPadding + "," + topBottomPadding + ")"
        tickTranslate = "translate(" + leftPadding + "," + (topBottomPadding - 5) + ")";

    const yScale = d3.scaleLinear()
        .range([chartHeight - 10, 0])
        .domain([0, 1]);

    window.onload = setMap();

    // FUNCTIONS
    function setMap() {
        // let width = window.innerWidth;
        let width = $("#map").outerWidth(true)
        // let height = (windowHeight - 30) / 2;
        
        // SETUP MAP
        const map = d3.select("#map")
            .append("svg")
            .attr("class", "map")
            .attr("width", width)
            .attr("height", vizElementHeight)

        const projection = d3.geoAlbers()
            .center([0, 35.8])
            .rotate([78.65, 0, 0])
            .parallels([35.8, 35.8])
            .scale(vizElementHeight * 90)
            .translate([width / 2, vizElementHeight / 2]);

        const path = d3.geoPath()
            .projection(projection)

        // RETRIEVE DATA
        const promises = [];
        files.forEach(file => {
            if (file.split(".").pop() == "csv") {
                promises.push(d3.csv(file))
            } else {
                promises.push(d3.json(file))
            }
        });

        // DRAW MAP
        // Resolve Promises from data retrieval
        Promise.all(promises)
            // Run callback function to draw the map.
            // The function callback() is defined below
            .then(callback)
            .catch(error => {
                console.log(error)
            })

        // Callback function that plots loaded data
        function callback([nc, wake, svi]) {
            
            // Draw Counties
            let ncCounties = topojson.feature(nc, nc.objects.nc_counties)
            let counties = map.append("path")
                .datum(ncCounties)
                .attr("class", "counties")
                .attr("d", path)
            
            // Draw Graticule
            setGraticule(map, path)

            // Load Tracts
            let wakeTracts = topojson.feature(wake, wake.objects.wake_tracts_2010).features;
            
            // Join SVI data to Tracts
            wakeTracts = joinData(wakeTracts, svi, "GEOID10", "FIPS", attrArray) 

            // Draw Tracts
            let colorScale = makeColorScale(svi, colorClasses)
            let tracts = setEnumerationUnits(wakeTracts, "tracts", "GEOID10", map, path, colorScale)
            console.log(tracts)
            
            // Legend
            const legend = makeQuantileLegend("#legend", [0, 1], colorClasses, "Score")

            // Chart
            setChart(svi, colorScale)

            // Dropdown
            createDropdown(svi)

        } // End of callback()
    } // End of setMap()

    // Map Functions
    function setGraticule(map, path) {
        //  Graticule
        let graticule = d3.geoGraticule()
        .step([0.125, 0.125]);

        let gratLines = map.selectAll("gratLines")
            .data(graticule.lines())
            .enter()
            .append("path")
            .attr("class", "gratLines")
            .attr("d", path)
    }

    function joinData(regions, csvData, leftOn, rightOn, csvAttributes) {
        
        for (let i = 0; i < csvData.length; i++) {
            let csvRegion = csvData[i];
            let csvKey = csvRegion[rightOn];

            for (let a = 0; a < regions.length; a++) {
                let geojsonProps = regions[a].properties;
                let geojsonKey = parseInt(geojsonProps[leftOn])

                if (geojsonKey == csvKey) {
                    csvAttributes.forEach(attr => {
                        let val = parseFloat(csvRegion[attr]);
                        geojsonProps[attr] = val;
                    })
                }
            }
        }
        return regions
    }

    function setEnumerationUnits(regions, elClass, elIdAttribute, map, path, colorScale) {
        map.selectAll("." + elClass)
            .data(regions)
            .enter()
            .append("path")
            .attr("class", d => elClass + " tract-" + d.properties[elIdAttribute])
            .attr("d", path)
            .style("fill", d => choropleth(d.properties, colorScale))
            .on("mouseover", d => highlight(d.currentTarget.__data__.properties, "GEOID10"))
            .on("mouseout", d => dehighlight(d.currentTarget.__data__.properties, "GEOID10"))
            .on("mousemove", moveLabel)
            .append("desc")
            .text('{"stroke": "#000", "stroke-width": "0px"}')
    }

    function makeColorScale(data, colorClasses) {
        const colorScale = d3.scaleQuantile()
            .range(colorClasses);

        let domainArray = [];
        for (let i = 0; i < data.length; i++) {
            let val = parseFloat(data[i][expressed]);
            domainArray.push(val);
        }
        colorScale.domain(domainArray);

        return colorScale;
    }

    function choropleth(props, colorScale) {
        let val = parseFloat(props[expressed]);
        if (typeof val == "number" && !isNaN(val) && val >= 0) {
            return colorScale(val)
        } else {
            return "#CCC"
        }
    }

    // Legend Functions
    function makeQuantileLegend(containerId, rangeArray, colorClasses, title) {
        let legendSVG = legend({
            color: d3.scaleQuantize(rangeArray, colorClasses),
            title: title
        })
        d3.select(containerId)
            .html(legendSVG.outerHTML)
    }

    // Chart Functions
    function setChart(csvData, colorScale) {

        const chart = d3.select("#chart")
            .append("svg")
            .attr("width", chartWidth)
            .attr("height", chartHeight)
            .attr("class", "chart");

        const chartBackground = chart.append("rect")
            .attr("class", "chartBackground")
            .attr("width", chartInnerWidth)
            .attr("height", chartInnerHeight)
            .attr("transform", translate)

        const bars = chart.selectAll(".bars")
            .data(csvData)
            .enter()
            .append("rect")
            .sort((a, b) => a[expressed] - b[expressed])
            .attr("class", d => "bar tract-" + d.FIPS)
            .attr("width", chartInnerWidth / csvData.length - 1)
            .attr("x", (d, i) => i * (chartInnerWidth / csvData.length) + leftPadding)
            .attr("height", d => (chartInnerHeight - 10) - yScale(parseFloat(d[expressed])))
            // .attr("height", d => (chartHeight) - yScale(parseFloat(d[expressed])))
            .attr("y", d => yScale(parseFloat(d[expressed])) + topBottomPadding)
            .style("fill", d => choropleth(d, colorScale))
            .on("mouseover", d => highlight(d.target.__data__, "FIPS"))
            .on("mouseout", d => dehighlight(d.target.__data__, "FIPS"))
            .on("mousemove", moveLabel);
            

        let desc = bars.append("desc")
            .text('{"stroke": "none", "stroke-width": "0px"}')

        const chartTitle = chart.append("text")
            .attr("x", 40)
            .attr("y", 40)
            .attr("class", "chartTitle")
            .text(" Score")
        const chartSubtitle = chart.append("text")
            .attr("x", 40)
            .attr("y", 60)
            .attr("class", "chartSubtitle")
            .text("by Census Tract")

        const yAxis = d3.axisLeft()
            .scale(yScale)
        
        const axis = chart.append("g")
            .attr("class", "axis")
            .attr("transform", translate)
            .call(yAxis)

        // const chartFrame = chart.append("rect")
        //     .attr("class", "chartFrame")
        //     .attr("width", chartInnerWidth)
        //     .attr("height", chartInnerHeight)
        //     .attr("transform", translate)

        updateChart(bars, csvData.length, colorScale)
    } // End setChart()
    
    function createDropdown(csvData) {
        const dropdown = d3.select(".dropdown-container")
            .append("select")
            .attr("class", "dropdown")
            .on("change", function() {
                changeAttribute(this.value, csvData)
            });

        const titleOption = dropdown.append("option")
            .attr("class", "titleOption")
            .attr("disabled", "true")
            .text("Select Attribute");

        const attrOptions = dropdown.selectAll("attrOptions")
            .data(attrArray)
            .enter()
            .append("option")
            .attr("value", d => d)
            .text((d, i) => attrAliasArray[i])
    }

    function changeAttribute(attribute, csvData) {

        expressed = attribute;
        const colorScale = makeColorScale(csvData, colorClasses)

        let tracts = d3.selectAll(".tracts")
            .transition()
            .duration(1000)
            .style("fill", function(d) {
                return choropleth(d.properties, colorScale)
            })
        let bars = d3.selectAll(".bar")
            .sort((a, b) => a[expressed] - b[expressed]);

        updateChart(bars, csvData.length, colorScale)
    }

    function updateChart(bars, n, colorScale) {
        let expressedAttributeAlias = getExpressedAttributeAlias(expressed, attrArray, attrAliasArray)
        bars.transition()
            .duration(1000)
            .attr("x", (d, i) => i * (chartInnerWidth / n) + leftPadding)
            .attr("height", (d, i) => 463 - yScale(parseFloat(d[expressed])))
            .attr("y", (d, i) => yScale(parseFloat(d[expressed])) + topBottomPadding)
            .style("fill", d => choropleth(d, colorScale))

        let chartTitle = d3.select(".chartTitle")
            .text(expressedAttributeAlias + " Score");
    }

    function getExpressedAttributeAlias(expressed, attrArray, aliasArray) {
        let idx = attrArray.indexOf(expressed);
        return(aliasArray[idx])
    }

    function highlight(props, idAttr, nameAttr) {
        let selected = d3.selectAll(".tract-" + props[idAttr])
            .style("stroke", "yellow")
            .style("stroke-width", "3")

        setLabel(props, idAttr, nameAttr)
    }

    function dehighlight(props, attr) {
        let selected = d3.selectAll(".tract-" + props[attr])
            .style("stroke", function() {
                return getStyle(this, "stroke")
            })
            .style("stroke-width", function() {
                return getStyle(this, "stroke-width")
            })

        d3.select(".infolabel")
            .remove()

        function getStyle(element, styleName) {
            let styleText = d3.select(element)
            .select("desc")
            .text()
            
            let styleObject = JSON.parse(styleText);
            return styleObject[styleName]
        }
    }

    function setLabel(props, idAttr, nameAttr) {
        let expressedAttributeAlias = getExpressedAttributeAlias(expressed, attrArray, attrAliasArray)
        let labelAttribute = "<h1>" + props[expressed] + "</h1><b>" + expressedAttributeAlias + "</b>";

        let infolabel = d3.select("body")
            .append("div")
            .attr("class", "infolabel")
            .attr("id", "tract-" + props[idAttr] + "_label")
            .html(labelAttribute)

        let tractName = infolabel.append("div")
            .attr("class", "labelname")
            .html(props[nameAttr])

    }

    function moveLabel(event) {
        let labelWidth = d3.select(".infolabel")
            .node()
            .getBoundingClientRect()
            .width;

        let x1 = event.clientX + 10;
        let y1 = event.clientY - 75;
        let x2 = event.clientX - labelWidth - 10;
        let y2 = event.clientY + 25;

        let x = event.clientX > window.innerWidth - labelWidth - 20 ? x2 : x1;
        let y = event.clientY < 75 ? y2 : y1;

        d3.select(".infolabel")
            .style("left", x + "px")
            .style("top", y + "px")
    }

})() // End self-executing function