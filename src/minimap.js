/* minimap.js
 *
 * A factory for generating minimaps in D3
 *
 * Requires D3 V4 and topojson V2
 *
 */



let Minimap = (function() {

    // Constructor for map object
    function Map(width, height, scale, padding) {

        // height and width of main map in pixels
        this.height = height;
        this.width = width;

        // The scale of the main map to the minimap
        // i.e. a scale of 5 means the minimap is 1/5 of the size of the main
        this.scale = scale;

        // Default of 20px for padding
        this.padding = typeof padding === "undefined" ? 0 : padding;

        this.zoom = 1.0;

        // A D3 selection object for the main map
        this.mainMap = d3.select("body").append("svg")
            .remove()  // So we have a rendered but detached SVG
            .classed("mainMap", true)
            .attr("height", this.height)
            .attr("width", this.width);

        // Container group for main map features
        this.mainMap.append("g")
            .classed("features", true);

        // D3 selection object for the minimap
        this.miniMap = d3.select("body").append("svg")
            .remove()
            .classed("miniMap", true)
            .attr("height", this.height / this.scale)
            .attr("width", this.width / this.scale);

        // Container group for mini map features
        this.miniMap.append("g")
            .classed("features", true);

        // A "lamina" over the minimap features that we can click
        this.miniMap.append("rect")
            .attr("class", "lamina")
            .attr("width", this.width / this.scale)
            .attr("height", this.height / this.scale)
            .style("fill", "#999999")
            .style("fill-opacity", 0.2)
            .style("pointer-events", "all")
            .on("mousewheel", miniMapZoomed)
            .on("click", miniMapClicked);

        // A "viewport" over the minimap that spans the area visible in main
        this.miniMap.append("rect")
            .attr("class", "viewport")
            .attr("width", this.width / this.scale)
            .attr("height", this.height / this.scale)
            .style("fill", "#777777")
            .style("stroke", "#AA2222")
            .style("fill-opacity", 0.5)
            .on("mousewheel", miniMapZoomed)
            .call(d3.drag()
                .on("start", function() {
                    d3.select(this).classed("selected", true);
                })
                .on("drag", dragged)
                .on("end", function() {
                    d3.select(this).classed("selected", false);
                }));

        const self = this;


        // Populate the maps with a collection of geometries
        this.populate = function(collection) {
            let region_geo = topojson.feature(collection, collection.objects.features);
            let regions = region_geo.features;

            let mainProjection = d3.geoMercator()
                .fitExtent([[self.padding, self.padding],
                    [self.width - self.padding, self.height - self.padding]],
                    region_geo);

            console.log(mainProjection([0, 0]));

            let mainPath = d3.geoPath().projection(mainProjection);

            let miniProjection = d3.geoMercator()
                .fitExtent([[
                        (self.padding / self.scale),
                        (self.padding / self.scale)
                    ],
                    [
                        self.width / self.scale - (self.padding / self.scale),
                        self.height / self.scale - (self.padding / self.scale)
                    ]],
                    region_geo);

            let miniPath = d3.geoPath().projection(miniProjection);

            console.log(miniPath)

            self.mainMap.select(".features").selectAll(".region")
                .data(regions).enter()
                .append("path")
                .classed("region", true)
                .attr("d", mainPath)
                .attr("fill", "#aaaaaa");

            self.miniMap.select(".features").selectAll(".region")
                .data(regions).enter()
                .append("path")
                .classed("region", true)
                .attr("d", miniPath)
                .attr("fill", "#999999")

            return self;

        }

        // Fired when minimap lamina is clicked
        // not externally accessible
        // This might not work depending on how JS scoping operates
        function miniMapClicked() {

            let lamina = self.miniMap.select(".lamina");

            let scaled_width = self.width / self.scale * self.zoom;
            let scaled_height = self.height / self.scale * self.zoom;

            let offsetX = d3.mouse(lamina.node())[0] - (scaled_width / 2);
            let offsetY = d3.mouse(lamina.node())[1] - (scaled_height / 2);

            self.moveMap(offsetX, offsetY, undefined, 300);

        }

        function miniMapZoomed() {

            let transform = 1;

            if(event.deltaY < 0) {
                transform = 0.8;
            } else {
                transform = 1.2;
            }

            let viewport = self.miniMap.select(".viewport");
            let lamina = self.miniMap.select(".lamina");

            let viewportWidth = Number(viewport.attr("width"));
            let viewportHeight = Number(viewport.attr("height"));
            let viewportX = Number(viewport.attr("x"));
            let viewportY = Number(viewport.attr("y"));
            let viewportScale = self.zoom * transform;

            // Guard against zoom extents
            viewportScale = viewportScale > 1 ? 1 : viewportScale;
            viewportScale = viewportScale < 0.2 ? 0.2 : viewportScale;

            self.zoom = viewportScale;

            let centre = {
                x: d3.mouse(lamina.node())[0],
                y: d3.mouse(lamina.node())[1]
            };

            let scaled_width = self.width / self.scale * viewportScale;
            let scaled_height = self.height / self.scale * viewportScale;

            let offsetX = centre.x - (scaled_width / 2);
            let offsetY = centre.y - (scaled_height / 2);


            viewport.attr("width", scaled_width)
                .attr("height", scaled_height);

            self.moveMap(offsetX, offsetY, viewportScale);
        }

        // Called on drag event
        function dragged() {

            let offsetX = d3.event.dx;
            let offsetY = d3.event.dy;

            let viewport = self.miniMap.select(".viewport");

            let X = Number(viewport.attr("x"));
            let Y = Number(viewport.attr("y"));

            let deltaX = X + offsetX;
            let deltaY = Y + offsetY;
            self.moveMap(deltaX, deltaY);
        }

        this.moveMap = function(x, y, zoomed, transition) {

            transition = typeof transition  === "undefined" ? 0 : transition;
            zoomed = typeof zoomed === "undefined" ? self.zoom : zoomed;

            x = x + (self.width / self.scale * zoomed) > self.width / self.scale ?
                self.width / self.scale - (self.width / self.scale * zoomed) : x;
            x = x < 0 ? 0 : x;

            y = y + (self.height / self.scale * zoomed) > self.height / self.scale ?
                self.height / self.scale - (self.height / self.scale * zoomed) : y;
            y = y < 0 ? 0 : y;

            // Set zoom property
            self.zoom = zoomed;

            // Adjust minimap viewport position
            let viewport = self.miniMap.select(".viewport");

            if(transition > 0) {
                viewport.transition()
                    .duration(transition)
                    .attr("x", x)
                    .attr("y", y);
            } else {
                viewport
                    .attr("x", x)
                    .attr("y", y);
            }

            // Transform main map
            x = String(-x / zoomed * self.scale);
            y = String(-y / zoomed * self.scale);

            let mainFeatures = self.mainMap.select(".features");

            if(transition > 0) {
                mainFeatures.transition()
                    .duration(transition)
                    .attr("transform", "translate(" + x + " " + y + ")scale(" + String(1 / zoomed) + ")");
            } else {
                mainFeatures
                    .attr("transform", "translate(" + x + " " + y + ")scale(" + String(1 / zoomed) + ")");
            }

        }

        // Zoom and translate the map and viewport to make it more obvious
        // how to use it
        this.jaunty = function() {

            self.zoom = 0.5;

            let x = self.width / self.scale * 0.25;
            let y = self.height / self.scale * 0.25;

            let scaled_width = self.width / self.scale * self.zoom;
            let scaled_height = self.height / self.scale * self.zoom;

            self.miniMap.select(".viewport")
                .attr("width", scaled_width)
                .attr("height", scaled_height);

            self.moveMap(x, y, self.zoom);


        }

    }

    // Bargain basement object factory
    function mapFactory(width, height, scale, padding) {
        return new Map(width, height, scale, padding);
    }

    let exposedMethods = {
        map: mapFactory
    };

    return exposedMethods;

})();